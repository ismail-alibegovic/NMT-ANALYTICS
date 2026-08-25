import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { requestId, requestLogging } from './middleware/logging';
import { authRateLimit, strictRateLimit, contextRateLimit } from './middleware/rateLimit';
import { config } from './config';
import apiRouter from './routes/index';
import { sentryRequestContext, sentryErrorHandler } from './middleware/sentry';

const app = express();
app.set('trust proxy', 1);const adminDistPath = path.resolve(process.cwd(), '../nmt-analytics-admin/dist');

// Serve static assets BEFORE helmet/cors so JS/CSS/other asset requests
// are never subject to CORS preflight or thrown CORS errors. Static asset
// files have hashed names and no auth sensitivity.
app.use('/assets', express.static(path.join(adminDistPath, 'assets'), {
  immutable: true,
  maxAge: '1y',
  fallthrough: true,
}));

app.use(express.static(adminDistPath, { fallthrough: true }));

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to allow SPA with inline styles/scripts
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
}));

function isAllowedOrigin(origin: string): boolean {
  if (origin === config.ADMIN_URL) return true;

  if (config.NODE_ENV === 'development') {
    return origin === 'http://localhost:5173' || origin === 'http://localhost:5174';
  }

  try {
    const { hostname } = new URL(origin);
    return hostname.endsWith('.zocomputer.io') || hostname.endsWith('.zo.computer');
  } catch {
    return false;
  }
}

// Root route
app.get('/', (req, res) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(adminDistPath, 'index.html'));
  } else {
    res.json({
      name: 'Travline API',
      status: 'ok',
      health: '/api/health'
    });
  }
});

// Middleware
app.use(requestId);
app.use(requestLogging);
app.use(cors({
  origin: (origin, callback) => {
    // Treat CORS denial as a soft denial (no headers) instead of throwing —
    // throwing here falls through to the global error handler, which
    // responds with application/json and 500. That breaks same-origin
    // static files when some subresource fetches send an Origin header.
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  optionsSuccessStatus: 200
}));
app.use(express.json());

// Sentry request scope — populates user/org tags on each /api request.
// Mounted after json() + before /api route mounting; if the request
// carries no auth context, the scope tags are simply not set.
app.use('/api', sentryRequestContext);

// Apply rate limiting to all /api routes
app.use('/api', (req, res, next) => {
  if (req.path === '/health') {
    return next();
  }
  return contextRateLimit(req, res, next);
});

app.use('/api/me', contextRateLimit);

app.use(['/api/customers', '/api/metrics', '/api/analytics'], (req, res, next) => {
  console.log(`[API-${req.method}] ${req.path} - userId: ${req.user?.id || 'N/A'}, role: ${req.user?.role || 'N/A'}, orgId: ${req.orgId || 'N/A'}`);
  next();
});

// Public Forms — mounted directly (no auth) to avoid Express 5 sub-router conflict.
// Apply strict rate limiting to public endpoints to prevent abuse.
app.get('/api/public/forms/:slug', strictRateLimit, async (req: any, res: any) => {
  const { getPublicForm } = require('./routes/publicFormsHandlers');
  return getPublicForm(req, res);
});
app.post('/api/public/forms/:slug', strictRateLimit, async (req: any, res: any) => {
  const { submitPublicForm } = require('./routes/publicFormsHandlers');
  return submitPublicForm(req, res);
});

app.use('/api', apiRouter);

// SPA fallback — any non-API, non-asset GET returns the React app so client
// routes (/operations/*, /customers/:id, /auth/*, …) keep working on hard refresh
// and direct navigation. Mounted after /api so API 404s still return JSON.
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const p = req.path;
  if (p.startsWith('/assets/') || p.startsWith('/api/') || p.startsWith('/images/') || /\.[a-zA-Z0-9]+$/.test(p)) {
    return next();
  }
  res.sendFile(path.join(adminDistPath, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

const errorMessages: Record<string, string> = {
  RATE_LIMITED: 'Too many requests',
  VALIDATION_ERROR: 'Validation error',
  ORG_NOT_FOUND: 'Organization not found',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Not found',
  INTERNAL_ERROR: 'Internal server error',
};

// Sentry error capture — must be registered before the global JSON error
// handler so failures are collected before they are turned into JSON 500s.
app.use(sentryErrorHandler);


// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[GLOBAL ERROR]', err.stack || err);

  if (err.status === 429 || err.message?.includes('Too many')) {
    return res.status(429).json({ code: 'RATE_LIMITED', message: errorMessages.RATE_LIMITED });
  }

  if (err.name === 'ZodError' || err.code === 'VALIDATION_ERROR') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', details: err.issues });
  }

  if (err.message?.includes('ORG_NOT_FOUND') || err.message?.includes('organization not found')) {
    return res.status(400).json({ code: 'ORG_NOT_FOUND', message: errorMessages.ORG_NOT_FOUND });
  }

  if (err.message?.includes('not authenticated') || err.message?.includes('Invalid or expired token') || err.status === 401) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: errorMessages.UNAUTHORIZED });
  }

  if (err.message?.includes('Access forbidden') || err.status === 403) {
    return res.status(403).json({ code: 'FORBIDDEN', message: errorMessages.FORBIDDEN });
  }

  if (err.message?.includes('not found') || err.status === 404) {
    return res.status(404).json({ code: 'NOT_FOUND', message: errorMessages.NOT_FOUND });
  }

  return res.status(500).json({ code: 'INTERNAL_ERROR', message: errorMessages.INTERNAL_ERROR });
});

export default app;

