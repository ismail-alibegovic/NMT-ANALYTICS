import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { z } from 'zod';
import { EmailService } from '../lib/email/EmailService';
import { SmtpEmailProvider } from '../lib/email/SmtpProvider';

const router = Router();

router.use(authenticateToken);
router.use(requireOrgContext);

const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(587),
  user: z.string().min(1),
  pass: z.string().min(1),
  fromEmail: z.string().email(),
});

// GET /settings/email - Get email config (masked)
router.get('/', requireMinimumRole('director'), async (req: Request, res: Response) => {
  try {
    const { data } = await supabaseAdmin
      .from('org_settings')
      .select('value')
      .eq('org_id', req.orgId!)
      .eq('key', 'smtp_config')
      .single();

    if (!data) {
      return res.json({ configured: false });
    }

    const config = data.value as Record<string, any>;
    // Mask password
    return res.json({
      configured: true,
      host: config.host,
      port: config.port,
      user: config.user,
      fromEmail: config.fromEmail,
      pass: '********',
    });
  } catch {
    return res.json({ configured: false });
  }
});

// POST /settings/email/test - Send test email
router.post('/test', requireMinimumRole('director'), async (req: Request, res: Response) => {
  const { host, port, user, pass, fromEmail } = smtpConfigSchema.parse(req.body);

  try {
    const provider = new SmtpEmailProvider({ host, port, user, pass, fromEmail: fromEmail });
    EmailService.setProvider(provider);

    await provider.sendEmail({
      to: req.user!.email || 'test@example.com',
      subject: 'NMT Analytics — SMTP Test',
      body: 'SMTP configuration is working correctly.',
    });

    return res.json({ success: true, message: 'Test email sent' });
  } catch (err: any) {
    return apiError(res, 400, 'SMTP_TEST_FAILED', err.message || 'Failed to send test email');
  }
});

// POST /settings/email - Save SMTP config
router.post('/', requireMinimumRole('director'), async (req: Request, res: Response) => {
  try {
    const config = smtpConfigSchema.parse(req.body);

    await supabaseAdmin
      .from('org_settings')
      .upsert({
        org_id: req.orgId!,
        key: 'smtp_config',
        value: config,
      }, { onConflict: 'org_id,key' });

    // Activate live
    const provider = new SmtpEmailProvider({
      host: config.host,
      port: config.port,
      user: config.user,
      pass: config.pass,
      fromEmail: config.fromEmail,
    });
    EmailService.setProvider(provider);

    return res.json({ success: true, message: 'SMTP configuration saved and activated' });
  } catch (err: any) {
    return apiError(res, 400, 'VALIDATION_ERROR', err.message || 'Invalid SMTP configuration');
  }
});

export default router;
