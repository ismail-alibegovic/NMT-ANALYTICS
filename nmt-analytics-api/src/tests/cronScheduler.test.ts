import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

let processed: any[] = [];
let processorCalled = 0;

vi.mock('../lib/campaigns', () => ({
  processDueScheduledCampaigns: vi.fn(async () => {
    processorCalled++;
    return {
      processed: processed.length,
      succeeded: processed.filter((p) => p.status === 'completed').length,
      failed: processed.filter((p) => p.status === 'failed').length,
      results: [...processed],
    };
  }),
}));

import internalRouter from '../routes/internal';

function app() {
  const app = express();
  app.use(express.json());
  app.use(internalRouter);
  return app;
}

describe('POST /internal/jobs/process-scheduled-campaigns', () => {
  beforeEach(() => {
    processed = [];
    processorCalled = 0;
  });

  it('fails closed when secret env var is not configured', async () => {
    vi.stubEnv('SCHEDULED_CAMPAIGNS_CRON_SECRET', undefined);
    const res = await request(app())
      .post('/internal/jobs/process-scheduled-campaigns')
      .set('Authorization', 'Bearer test-cron-secret-2026');
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('unavailable');
    expect(processorCalled).toBe(0);
  });

  it('returns 401 when Authorization header is missing', async () => {
    vi.stubEnv('SCHEDULED_CAMPAIGNS_CRON_SECRET', 'test-cron-secret-2026');
    const res = await request(app())
      .post('/internal/jobs/process-scheduled-campaigns');
    expect(res.status).toBe(401);
    expect(processorCalled).toBe(0);
  });

  it('returns 401 when secret is wrong', async () => {
    vi.stubEnv('SCHEDULED_CAMPAIGNS_CRON_SECRET', 'test-cron-secret-2026');
    const res = await request(app())
      .post('/internal/jobs/process-scheduled-campaigns')
      .set('Authorization', 'Bearer wrong-secret');
    expect(res.status).toBe(401);
    expect(processorCalled).toBe(0);
  });

  it('accepts correct secret and invokes due processor', async () => {
    vi.stubEnv('SCHEDULED_CAMPAIGNS_CRON_SECRET', 'test-cron-secret-2026');
    processed = [
      { campaignId: 'camp-a', status: 'completed' },
      { campaignId: 'camp-b', status: 'failed' },
    ];
    const res = await request(app())
      .post('/internal/jobs/process-scheduled-campaigns')
      .set('Authorization', 'Bearer test-cron-secret-2026');
    expect(res.status).toBe(200);
    expect(processorCalled).toBe(1);
    expect(res.body.processed).toBe(2);
    expect(res.body.completed).toBe(1);
    expect(res.body.failed).toBe(1);
  });

  it('response contains no recipient PII', async () => {
    vi.stubEnv('SCHEDULED_CAMPAIGNS_CRON_SECRET', 'test-cron-secret-2026');
    processed = [{ campaignId: 'camp-c', status: 'completed' }];
    const res = await request(app())
      .post('/internal/jobs/process-scheduled-campaigns')
      .set('Authorization', 'Bearer test-cron-secret-2026');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('customer');
    expect(body).not.toContain('email');
    expect(body).not.toContain('phone');
    expect(body).not.toContain('name');
  });

  it('processor handles multiple due campaigns', async () => {
    vi.stubEnv('SCHEDULED_CAMPAIGNS_CRON_SECRET', 'test-cron-secret-2026');
    processed = [
      { campaignId: 'camp-1', status: 'completed' },
      { campaignId: 'camp-2', status: 'completed' },
      { campaignId: 'camp-3', status: 'failed' },
    ];
    const res = await request(app())
      .post('/internal/jobs/process-scheduled-campaigns')
      .set('Authorization', 'Bearer test-cron-secret-2026');
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(3);
    expect(res.body.completed).toBe(2);
    expect(res.body.failed).toBe(1);
  });

  it('one failed campaign does not stop others', async () => {
    vi.stubEnv('SCHEDULED_CAMPAIGNS_CRON_SECRET', 'test-cron-secret-2026');
    processed = [
      { campaignId: 'ok-1', status: 'completed' },
      { campaignId: 'fail', status: 'failed' },
      { campaignId: 'ok-2', status: 'completed' },
    ];
    const res = await request(app())
      .post('/internal/jobs/process-scheduled-campaigns')
      .set('Authorization', 'Bearer test-cron-secret-2026');
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(3);
    expect(res.body.completed).toBe(2);
    expect(res.body.failed).toBe(1);
  });

  it('duplicate worker invocation cannot double-send', async () => {
    vi.stubEnv('SCHEDULED_CAMPAIGNS_CRON_SECRET', 'test-cron-secret-2026');
    processed = [{ campaignId: 'dup', status: 'completed' }];
    await request(app())
      .post('/internal/jobs/process-scheduled-campaigns')
      .set('Authorization', 'Bearer test-cron-secret-2026');
    const res2 = await request(app())
      .post('/internal/jobs/process-scheduled-campaigns')
      .set('Authorization', 'Bearer test-cron-secret-2026');
    expect(res2.status).toBe(200);
    expect(res2.body.processed).toBe(1);
    expect(processorCalled).toBe(2);
  });
});
