import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

let processed: any[] = [];
let processorCalled = 0;
let reminderResult: any = {
  createdCount: 2,
  processedCount: 2,
  emailSent: 1,
  emailSkipped: 1,
  emailFailed: 0,
  smsSent: 2,
  smsSkipped: 0,
  smsFailed: 0,
  results: [],
};

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

vi.mock('../lib/automationExecution', () => ({
  processDueAutomationRules: vi.fn(async () => {
    return {
      rulesExamined: 3,
      entitiesFound: 5,
      completed: 4,
      failed: 0,
      skipped: 1,
      alreadyProcessed: 0,
      messagesSent: 4,
      messagesFailed: 0,
      messagesSkipped: 1,
    };
  }),
}));

vi.mock('../lib/reminderDelivery', () => ({
  runUpcomingDepartureReminderDelivery: vi.fn(async () => {
    if (reminderResult instanceof Error) {
      throw reminderResult;
    }
    return reminderResult;
  }),
}));

import internalRouter from '../routes/internal';

function app() {
  const app = express();
  app.use(express.json());
  app.use(internalRouter);
  return app;
}

describe('Internal Cron Schedulers', () => {
  beforeEach(() => {
    vi.stubEnv('COMMUNICATION_JOBS_ENABLED', 'true');
    processed = [];
    processorCalled = 0;
    reminderResult = {
      createdCount: 2,
      processedCount: 2,
      emailSent: 1,
      emailSkipped: 1,
      emailFailed: 0,
      smsSent: 2,
      smsSkipped: 0,
      smsFailed: 0,
      results: [],
    };
    vi.stubEnv('SCHEDULED_CAMPAIGNS_CRON_SECRET', undefined);
    vi.stubEnv('CRON_SECRET', undefined);
  });

  it.each(['get', 'post'] as const)('keeps %s jobs inactive until explicitly enabled', async method => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.stubEnv('COMMUNICATION_JOBS_ENABLED', undefined);
    const res = await request(app())[method]('/internal/jobs/process-communication-jobs')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('scheduler_disabled');
    expect(processorCalled).toBe(0);
  });

  it('supports an authenticated Vercel GET without caching', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    const res = await request(app()).get('/internal/jobs/process-communication-jobs')
      .set('Authorization', 'Bearer test-secret');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(processorCalled).toBe(1);
  });

  it('rejects unauthenticated Vercel GET before running workers', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    const res = await request(app()).get('/internal/jobs/process-communication-jobs');
    expect(res.status).toBe(401);
    expect(processorCalled).toBe(0);
  });

  describe('POST /internal/jobs/process-scheduled-campaigns', () => {
    it('fails closed when secret env var is not configured', async () => {
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

    it('accepts CRON_SECRET from Vercel', async () => {
      vi.stubEnv('CRON_SECRET', 'vercel-cron-secret-2026');
      processed = [{ campaignId: 'camp-v', status: 'completed' }];
      const res = await request(app())
        .post('/internal/jobs/process-scheduled-campaigns')
        .set('Authorization', 'Bearer vercel-cron-secret-2026');
      expect(res.status).toBe(200);
      expect(res.body.completed).toBe(1);
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
  });

  describe('POST /internal/jobs/process-departure-reminders', () => {
    it('executes departure reminders delivery when authorized', async () => {
      vi.stubEnv('CRON_SECRET', 'vercel-cron-secret-2026');
      const res = await request(app())
        .post('/internal/jobs/process-departure-reminders')
        .set('Authorization', 'Bearer vercel-cron-secret-2026');

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(2);
      expect(res.body.emailSent).toBe(1);
      expect(res.body.smsSent).toBe(2);
    });
  });

  describe('POST /internal/jobs/process-communication-jobs', () => {
    it('executes campaigns, automation rules, and departure reminders simultaneously', async () => {
      vi.stubEnv('CRON_SECRET', 'vercel-cron-secret-2026');
      processed = [{ campaignId: 'camp-1', status: 'completed' }];

      const res = await request(app())
        .post('/internal/jobs/process-communication-jobs')
        .set('Authorization', 'Bearer vercel-cron-secret-2026');

      expect(res.status).toBe(200);
      expect(res.body.campaigns.processed).toBe(1);
      expect(res.body.automation.rulesExamined).toBe(3);
      expect(res.body.reminders.created).toBe(2);
      expect(res.body.reminders.smsSent).toBe(2);
    });

    it('reports worker failure without exposing raw errors', async () => {
      vi.stubEnv('CRON_SECRET', 'vercel-cron-secret-2026');
      reminderResult = new Error('Database connection timeout during reminder generation');

      const res = await request(app())
        .post('/internal/jobs/process-communication-jobs')
        .set('Authorization', 'Bearer vercel-cron-secret-2026');

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('scheduler_execution_failed');
      expect(JSON.stringify(res.body)).not.toContain('timeout');
    });
  });
});

