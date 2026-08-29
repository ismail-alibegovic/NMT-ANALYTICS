import { Router, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { processDueScheduledCampaigns } from '../lib/campaigns';
import { processDueAutomationRules } from '../lib/automationExecution';

const router = Router();

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function requireCronSecret(req: Request, res: Response): boolean {
  const configured = process.env.SCHEDULED_CAMPAIGNS_CRON_SECRET;
  if (!configured || configured.length === 0) {
    res.status(503).json({ error: 'scheduler_unavailable' });
    return false;
  }

  const auth = req.header('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }

  const token = auth.slice('Bearer '.length).trim();
  if (token.length === 0 || !constantTimeEqual(token, configured)) {
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

router.post('/internal/jobs/process-communication-jobs', async (req: Request, res: Response) => {
  if (!requireCronSecret(req, res)) return;

  const [campaignResult, automationResult] = await Promise.all([
    processDueScheduledCampaigns(),
    processDueAutomationRules(),
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
  });
});

export default router;
