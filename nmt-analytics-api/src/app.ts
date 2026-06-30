import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { requestId, requestLogging } from './middleware/logging';
import { authRateLimit, strictRateLimit } from './middleware/rateLimit';
import { config } from './config';
import apiRouter from './routes/index';

const app = express();
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to allow SPA with inline styles/scripts
  crossOriginEmbedderPolicy: false,
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
if (config.NODE_ENV !== 'production') {
  app.get('/', (req, res) => {
    res.json({
      name: 'NMT Analytics API',
      status: 'ok',
      health: '/api/health'
    });
  });
}

// Middleware
app.use(requestId);
app.use(requestLogging);
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin requests, mobile apps, curl, health checks)
    if (!origin) return callback(null, true);

    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));
app.use(express.json());

// Apply rate limiting to all /api routes
app.use('/api', (req, res, next) => {
  // Skip rate limiting for health check
  if (req.path === '/health') {
    return next();
  }
  return authRateLimit(req, res, next);
});

// Apply stricter rate limiting to auth-related routes
// The me route is now at /api/me
app.use('/api/me', strictRateLimit);

// Logging middleware for specific API routes
app.use(['/api/customers', '/api/metrics', '/api/analytics'], (req, res, next) => {
  console.log(`[API-${req.method}] ${req.path} - userId: ${req.user?.id || 'N/A'}, role: ${req.user?.role || 'N/A'}, orgId: ${req.orgId || 'N/A'}`);
  next();
});

// Routes
app.use('/api', apiRouter);

if (config.NODE_ENV === 'production') {
  const adminDistPath = path.resolve(process.cwd(), '../nmt-analytics-admin/dist');
  app.use(express.static(adminDistPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(adminDistPath, 'index.html'));
  });
}

// 404 handler
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

