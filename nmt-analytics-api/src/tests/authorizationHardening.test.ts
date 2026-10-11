import { describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { requireMinimumRole } from '../middleware/requireRole';

function roleApp(role: string) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: 'user-1', email: 'user@travline.test', role };
    next();
  });
  app.post('/manager-operation', requireMinimumRole('manager'), (_req, res) => res.status(204).send());
  app.post('/agent-operation', requireMinimumRole('agent'), (_req, res) => res.status(204).send());
  return app;
}

describe('API authorization hardening', () => {
  it.each(['viewer', 'agent'])('denies %s from manager-only mutations', async (role) => {
    const response = await request(roleApp(role)).post('/manager-operation');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('allows a manager to perform manager-only mutations', async () => {
    const response = await request(roleApp('manager')).post('/manager-operation');

    expect(response.status).toBe(204);
  });

  it('allows an agent to perform agent-level reservation-style mutations', async () => {
    const response = await request(roleApp('agent')).post('/agent-operation');

    expect(response.status).toBe(204);
  });
});

describe('retired legacy sub-agent sale path', () => {
  it('returns an explicit retirement response without reaching a database writer', async () => {
    vi.resetModules();
    vi.doMock('../middleware/authenticateToken', () => ({
      authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
        req.user = { id: 'director-1', email: 'director@travline.test', role: 'director' };
        next();
      },
    }));
    vi.doMock('../middleware/requireOrgContext', () => ({
      requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
        req.orgId = 'org-1';
        next();
      },
    }));

    const { default: subAgentRoutes } = await import('../routes/subagents');
    const app = express();
    app.use('/api', subAgentRoutes);

    const response = await request(app).post('/api/subagents/sub-agent-1/generate-sale').send({});

    expect(response.status).toBe(410);
    expect(response.body.code).toBe('LEGACY_SALE_DISABLED');
  });
});
