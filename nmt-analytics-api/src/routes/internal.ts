import { Router, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { processDueScheduledCampaigns } from '../lib/campaigns';

const router = Router();

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

router.post('/internal/jobs/process-scheduled-campaigns', async (_req: Request, res: Response) => {
  const configured = process.env.SCHEDULED_CAMPAIGNS_CRON_SECRET;
  if (!configured || configured.length === 0) {
    return res.status(503).json({ error: 'scheduler_unavailable' });
  }

  const auth = _req.header('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const token = auth.slice('Bearer '.length).trim();
  if (token.length === 0 || !constantTimeEqual(token, configured)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const result = await processDueScheduledCampaigns();

  return res.json({
    processed: result.processed,
    completed: result.succeeded,
    failed: result.failed,
    locked: result.results.filter((r) => r.status === 'already-processing').length,
  });
});

export default router;
