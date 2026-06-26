import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV === 'development';

const rateLimitHandler = (message: string) => (req: any, res: any) => {
  res.status(429).json({ code: 'RATE_LIMITED', message, requestId: req.requestId });
};

// Stricter rate limiter for auth-related endpoints
export const strictRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 1000 : 10, // Relax in dev
  handler: rateLimitHandler('Too many authentication attempts, please try again later.'),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev, // Completely skip in dev if needed, or just use high max
});

// Standard rate limiter for authenticated routes
export const authRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: isDev ? 2000 : 60, // Relax in dev
  handler: rateLimitHandler('Too many requests from this IP, please try again later.'),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
});

// Higher limit for context-related endpoints to prevent loops
export const contextRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: isDev ? 5000 : 200, // Higher limit for context
  handler: rateLimitHandler('Context rate limit exceeded.'),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
});
