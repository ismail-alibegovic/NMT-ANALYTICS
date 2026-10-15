import { Router, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { processDueScheduledCampaigns } from '../lib/campaigns';
import { processDueAutomationRules } from '../lib/automationExecution';
import { runUpcomingDepartureReminderDelivery } from '../lib/reminderDelivery';

const router = Router();

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function requireCronSecret(req: Request, res: Response): boolean {
  const secret1 = process.env.SCHEDULED_CAMPAIGNS_CRON_SECRET;
  const secret2 = process.env.CRON_SECRET;

  const hasSecret1 = Boolean(secret1 && secret1.length > 0);
  const hasSecret2 = Boolean(secret2 && secret2.length > 0);

  if (!hasSecret1 && !hasSecret2) {
    res.status(503).json({ error: 'scheduler_unavailable' });
    return false;
  }

  const auth = req.header('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }

  const token = auth.slice('Bearer '.length).trim();
  if (token.length === 0) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }

  const valid1 = hasSecret1 && constantTimeEqual(token, secret1!);
  const valid2 = hasSecret2 && constantTimeEqual(token, secret2!);

  if (!valid1 && !valid2) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }

  return true;
}

router.post('/internal/jobs/process-scheduled-campaigns', async (req: Request, res: Response) => {
  if (!requireCronSecret(req, res)) return;

  const result = await processDueScheduledCampaigns();

  return res.json({
    processed: result.processed,
    completed: result.succeeded,
    failed: result.failed,
    locked: result.results.filter((r) => r.status === 'already-processing').length,
  });
});

router.post('/internal/jobs/process-departure-reminders', async (req: Request, res: Response) => {
  if (!requireCronSecret(req, res)) return;

  const result = await runUpcomingDepartureReminderDelivery();

  return res.json({
    created: result.createdCount,
    processed: result.processedCount,
    emailSent: result.emailSent,
    emailSkipped: result.emailSkipped,
    emailFailed: result.emailFailed,
    smsSent: result.smsSent,
    smsSkipped: result.smsSkipped,
    smsFailed: result.smsFailed,
  });
});

router.post('/internal/jobs/process-communication-jobs', async (req: Request, res: Response) => {
  if (!requireCronSecret(req, res)) return;

  const [campaignResult, automationResult, reminderResult] = await Promise.all([
    processDueScheduledCampaigns(),
    processDueAutomationRules(),
    runUpcomingDepartureReminderDelivery().catch((err) => {
      console.error('[InternalJob] Departure reminder delivery failed:', err);
      return {
        createdCount: 0,
        processedCount: 0,
        emailSent: 0,
        emailSkipped: 0,
        emailFailed: 0,
        smsSent: 0,
        smsSkipped: 0,
        smsFailed: 0,
        results: [],
        error: err?.message || 'reminder_delivery_failed',
      };
    }),
  ]);

  return res.json({
    campaigns: {
      processed: campaignResult.processed,
      completed: campaignResult.succeeded,
      failed: campaignResult.failed,
      locked: campaignResult.results.filter((r) => r.status === 'already-processing').length,
    },
    automation: {
      rulesExamined: automationResult.rulesExamined,
      entitiesFound: automationResult.entitiesFound,
      completed: automationResult.completed,
      failed: automationResult.failed,
      skipped: automationResult.skipped,
      alreadyProcessed: automationResult.alreadyProcessed,
      messagesSent: automationResult.messagesSent,
      messagesFailed: automationResult.messagesFailed,
      messagesSkipped: automationResult.messagesSkipped,
    },
    reminders: {
      created: reminderResult.createdCount,
      processed: reminderResult.processedCount,
      emailSent: reminderResult.emailSent,
      emailSkipped: reminderResult.emailSkipped,
      emailFailed: reminderResult.emailFailed,
      smsSent: reminderResult.smsSent,
      smsSkipped: reminderResult.smsSkipped,
      smsFailed: reminderResult.smsFailed,
      ...('error' in reminderResult ? { error: (reminderResult as any).error } : {}),
    },
  });
});

export default router;
