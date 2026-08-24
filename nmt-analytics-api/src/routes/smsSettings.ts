import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { auditLog } from '../middleware/auditLogger';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { createSmsProvider, SmsProviderConfig, SmsService } from '../lib/sms/SmsService';

const router = Router();

const auditSmsSettingsUpdate = auditLog('UPDATE', 'settings', (req) => req.orgId!, undefined);
const auditSmsSettingsTest = auditLog('VIEW', 'settings', (req) => req.orgId!, undefined);

router.use(authenticateToken);
router.use(requireOrgContext);

const smsConfigSchema = z.object({
  provider: z.literal('mock'),
});

const smsTestSchema = z.object({
  to: z.string().trim().min(1).regex(/^\+[1-9]\d{7,14}$/, 'Recipient must be in E.164 format'),
  message: z.string().trim().min(1).max(320).optional(),
});

function isMissingColumnError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42703');
}

async function getSavedSmsConfig(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('org_settings')
    .select('value')
    .eq('org_id', orgId)
    .eq('key', 'sms_config')
    .single();

  if (error || !data?.value) {
    return null;
  }

  return smsConfigSchema.parse(data.value);
}

async function getSmsSender(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('sms_sender_name,sms_sender_number')
    .eq('id', orgId)
    .single();

  if (isMissingColumnError(error)) {
    return { sms_sender_name: null, sms_sender_number: null };
  }

  if (error || !data) {
    throw new Error('Failed to load SMS sender settings');
  }

  return data as { sms_sender_name?: string | null; sms_sender_number?: string | null };
}

router.get('/', requireMinimumRole('director'), async (req: Request, res: Response) => {
  try {
    const [config, sender] = await Promise.all([
      getSavedSmsConfig(req.orgId!),
      getSmsSender(req.orgId!),
    ]);

    if (!config) {
      return res.json({
        configured: false,
        senderName: sender.sms_sender_name || '',
        senderNumber: sender.sms_sender_number || '',
      });
    }

    return res.json({
      configured: true,
      provider: config.provider,
      senderName: sender.sms_sender_name || '',
      senderNumber: sender.sms_sender_number || '',
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid SMS configuration', err.issues);
    }
    return apiError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to load SMS settings');
  }
});

router.post('/', auditSmsSettingsUpdate, requireMinimumRole('director'), async (req: Request, res: Response) => {
  try {
    const config = smsConfigSchema.parse(req.body);

    await supabaseAdmin
      .from('org_settings')
      .upsert(
        {
          org_id: req.orgId!,
          key: 'sms_config',
          value: config,
        },
        { onConflict: 'org_id,key' }
      );

    SmsService.setProvider(createSmsProvider(config));

    return res.json({ success: true, message: 'SMS configuration saved and activated' });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid SMS configuration', err.issues);
    }
    return apiError(res, 400, 'SMS_CONFIG_FAILED', err.message || 'Failed to save SMS configuration');
  }
});

router.post('/test', auditSmsSettingsTest, requireMinimumRole('director'), async (req: Request, res: Response) => {
  try {
    const { to, message } = smsTestSchema.parse(req.body);
    const config = await getSavedSmsConfig(req.orgId!);

    if (!config) {
      return apiError(res, 400, 'SMS_NOT_CONFIGURED', 'SMS provider is not configured');
    }

    const sender = await getSmsSender(req.orgId!);
    if (!sender.sms_sender_number) {
      return apiError(res, 400, 'SMS_SENDER_MISSING', 'SMS sender number is not configured');
    }

    const provider = createSmsProvider(config);
    SmsService.setProvider(provider);

    await SmsService.sendSms({
      to,
      fromName: sender.sms_sender_name || null,
      fromNumber: sender.sms_sender_number,
      message: message || 'Travline SMS configuration is working correctly.',
    });

    return res.json({ success: true, message: 'Test SMS sent' });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid SMS test request', err.issues);
    }
    return apiError(res, 400, 'SMS_TEST_FAILED', err.message || 'Failed to send test SMS');
  }
});

export default router;
