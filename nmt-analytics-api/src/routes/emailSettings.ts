import { auditLog } from '../middleware/auditLogger';
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

// Audit wrappers for email_settings
const auditEmailSettingsCreate = auditLog('UPDATE', 'email_settings', undefined, undefined);
const auditEmailSettingsTest = auditLog('VIEW', 'email_settings', undefined, undefined);

router.use(authenticateToken);
router.use(requireOrgContext);

const smtpConfigSchema = z.object({
  host: z.string().trim().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().optional(),
  user: z.string().trim().min(1),
  pass: z.string().min(1),
  fromEmail: z.string().trim().email(),
  fromName: z.string().trim().optional(),
});

const smtpTestSchema = z.object({
  to: z.string().trim().email().optional(),
});

type SmtpConfig = z.infer<typeof smtpConfigSchema>;

function createSmtpProvider(config: SmtpConfig) {
  return new SmtpEmailProvider({
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    pass: config.pass,
    fromEmail: config.fromEmail,
    fromName: config.fromName,
  });
}

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
      secure: config.secure ?? config.port === 465,
      fromEmail: config.fromEmail,
      fromName: config.fromName || '',
      pass: '********',
    });
  } catch {
    return res.json({ configured: false });
  }
});

// POST /settings/email/test - Send test email
router.post('/test', auditEmailSettingsTest, requireMinimumRole('director'), async (req: Request, res: Response) => {
  try {
    const { to } = smtpTestSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('org_settings')
      .select('value')
      .eq('org_id', req.orgId!)
      .eq('key', 'smtp_config')
      .single();

    if (error || !data?.value) {
      return apiError(res, 400, 'SMTP_NOT_CONFIGURED', 'SMTP configuration is not saved');
    }

    const config = smtpConfigSchema.parse(data.value);
    const provider = createSmtpProvider(config);
    EmailService.setProvider(provider);

    await provider.sendEmail({
      to: to || req.user!.email || config.fromEmail,
      subject: 'Travline — SMTP Test',
      body: 'SMTP configuration is working correctly.',
    });

    return res.json({ success: true, message: 'Test email sent' });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid SMTP test request', err.issues);
    }
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
    const provider = createSmtpProvider(config);
    EmailService.setProvider(provider);

    return res.json({ success: true, message: 'SMTP configuration saved and activated' });
  } catch (err: any) {
    return apiError(res, 400, 'VALIDATION_ERROR', err.message || 'Invalid SMTP configuration');
  }
});

export default router;
