import { Router, Request, Response } from 'express';
import { config } from '../config';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireRole } from '../middleware/requireRole';

const router = Router();

/**
 * GET /api/doctor
 *
 * Diagnostic endpoint that shows current configuration.
 * Helps verify environment setup is correct.
 *
 * SECURITY: This route is intentionally disabled in production (returns 404)
 * and gated behind super_admin auth in development to avoid leaking config
 * (Supabase URL, key presence, CORS origins, dev flags) to untrusted callers.
 */
router.get(
    '/doctor',
    authenticateToken,
    requireOrgContext,
    requireRole(['super_admin']),
    (req: Request, res: Response) => {
        // Hard gate: never expose diagnostics outside development.
        if (config.NODE_ENV !== 'development') {
            return res.status(404).json({ message: 'Not found', code: 'NOT_FOUND' });
        }

        const diagnostics = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: {
                NODE_ENV: config.NODE_ENV,
                PORT: process.env.PORT || 3001,
            },
            supabase: {
                url: config.SUPABASE_URL,
                serviceRoleKeyPresent: !!config.SUPABASE_SERVICE_ROLE_KEY,
                serviceRoleKeyPrefix: config.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10) + '...',
            },
            cors: {
                ADMIN_URL: config.ADMIN_URL,
                allowedOrigins: [
                    config.ADMIN_URL,
                    'http://localhost:5173',
                    'http://localhost:5174'
                ]
            },
            devMode: {
                DEV_BYPASS_AUTH: config.DEV_BYPASS_AUTH || false,
                DEV_AUTO_BOOTSTRAP: config.DEV_AUTO_BOOTSTRAP || false,
                DEV_DEFAULT_ORG_NAME: config.DEV_DEFAULT_ORG_NAME,
                DEV_DEFAULT_ROLE: config.DEV_DEFAULT_ROLE,
            },
            warnings: [] as string[],
            recommendations: [] as string[]
        };

        // Add warnings
        if (config.DEV_BYPASS_AUTH) {
            diagnostics.warnings.push('⚠️  DEV_BYPASS_AUTH is enabled - authentication is bypassed!');
        }

        if (!config.DEV_AUTO_BOOTSTRAP && config.NODE_ENV === 'development') {
            diagnostics.recommendations.push('💡 Consider enabling DEV_AUTO_BOOTSTRAP=true for easier development');
        }

        if (config.ADMIN_URL !== 'http://localhost:5173' && config.NODE_ENV === 'development') {
            diagnostics.warnings.push(`⚠️  ADMIN_URL is ${config.ADMIN_URL} but Vite default is http://localhost:5173`);
        }

        res.json(diagnostics);
    }
);

export default router;
