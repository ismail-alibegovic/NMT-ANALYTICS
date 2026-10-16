import { auditLog } from '../middleware/auditLogger';
import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { z } from 'zod';
import { smtpConfigSchema } from '../lib/email/smtpConfig';
import { SmtpEmailProvider } from '../lib/email/SmtpProvider';

const router = Router();

// Audit wrappers for email_settings
const auditEmailSettingsTest = auditLog('VIEW', 'email_settings', undefined, undefined);

router.use(authenticateToken);
router.use(requireOrgContext);

const settingsSchema = smtpConfigSchema.extend({ fromEmail: z.string().trim().email() });

const smtpTestSchema = z.object({
  to: z.string().trim().email().optional(),
});

type SmtpConfig = z.infer<typeof smtpConfigSchema>;

function createSmtpProvider(config: SmtpConfig) {
  return new SmtpEmailProvider({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
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
      requireTLS: config.requireTLS ?? config.port === 587,
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

    const config = settingsSchema.parse(data.value);
    const provider = createSmtpProvider(config);

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
    return apiError(res, 400, 'SMTP_TEST_FAILED', 'SMTP provider did not accept the test message');
  }
});

// Verify SMTP connectivity/authentication without sending a message.
router.post('/verify', requireMinimumRole('director'), async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin.from('org_settings').select('value')
    .eq('org_id', req.orgId!).eq('key', 'smtp_config').single();
  if (error || !data?.value) return apiError(res, 400, 'SMTP_NOT_CONFIGURED', 'SMTP configuration is not saved');
  const parsed = settingsSchema.safeParse(data.value);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid SMTP configuration');
  const result = await SmtpEmailProvider.verifyConfig(parsed.data);
  return res.status(result.ok ? 200 : 400).json(result);
});

// POST /settings/email - Save SMTP config
router.post('/', requireMinimumRole('director'), async (req: Request, res: Response) => {
  try {
    const input = { ...req.body };
    if (input.pass === '********') {
      const { data, error } = await supabaseAdmin.from('org_settings').select('value')
        .eq('org_id', req.orgId!).eq('key', 'smtp_config').single();
      if (error || !data?.value?.pass) {
        return apiError(res, 400, 'SMTP_PASSWORD_REQUIRED', 'Enter the SMTP password');
      }
      input.pass = data.value.pass;
    }
    const config = settingsSchema.parse(input);

    const { error } = await supabaseAdmin
      .from('org_settings')
      .upsert({
        org_id: req.orgId!,
        key: 'smtp_config',
        value: config,
      }, { onConflict: 'org_id,key' });

    if (error) return apiError(res, 503, 'SMTP_SAVE_FAILED', 'SMTP settings could not be saved');

    // Providers are resolved per organisation at send time; never installed process-wide.
    return res.json({ success: true, message: 'SMTP configuration saved; delivery has not been verified' });
  } catch (err: any) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid SMTP configuration');
  }
});

export default router;

