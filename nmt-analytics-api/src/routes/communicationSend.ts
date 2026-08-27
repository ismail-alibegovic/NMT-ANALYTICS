import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { apiError } from '../lib/errors';
import { sendManualEmailForOrg, sendManualSmsForOrg } from '../lib/manualMessaging';
import {
  resolveRecipients,
  isBulkTarget,
  RecipientTargetNotFoundError,
  type RecipientChannel,
  type RecipientTargetType,
} from '../lib/recipientResolver';

const router = Router();

const targetSchema = z.object({
  channel: z.enum(['email', 'sms']),
  targetType: z.enum(['direct', 'reservation', 'passenger', 'group', 'departure']),
  targetId: z.string().uuid().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
});

const sendSchema = targetSchema.extend({
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(5000),
  confirm: z.boolean().optional().default(false),
});

function mapDeliveryError(message: string | undefined): { status: number; code: string } | null {
  if (
    message === 'SMTP_NOT_CONFIGURED' ||
    message === 'SMS_NOT_CONFIGURED' ||
    message === 'SMS_SENDER_MISSING'
  ) {
    return { status: 400, code: message };
  }
  return null;
}

// POST /api/communication/recipients/preview — resolve recipients, never sends.
router.post(
  '/communication/recipients/preview',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  async (req, res: Response) => {
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid preview payload', parsed.error.issues);
    }
    try {
      const resolution = await resolveRecipients({
        orgId: req.orgId!,
        channel: parsed.data.channel as RecipientChannel,
        targetType: parsed.data.targetType as RecipientTargetType,
        targetId: parsed.data.targetId ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
      });
      return res.json({ success: true, resolution });
    } catch (error) {
      if (error instanceof RecipientTargetNotFoundError) {
        return apiError(res, 404, 'NOT_FOUND', error.message);
      }
      console.error('Error in POST /communication/recipients/preview:', error);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to resolve recipients', String(error));
    }
  },
);

// POST /api/communication/send — resolve then dispatch through the existing manual senders.
router.post(
  '/communication/send',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  async (req, res: Response) => {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid send payload', parsed.error.issues);
    }
    const { channel, targetType, targetId, email, phone, subject, body, confirm } = parsed.data;

    if (channel === 'email' && (!subject || subject.length === 0)) {
      return apiError(res, 400, 'SUBJECT_REQUIRED', 'Subject is required for email');
    }

    const orgId = req.orgId!;

    let resolution;
    try {
      resolution = await resolveRecipients({
        orgId,
        channel: channel as RecipientChannel,
        targetType: targetType as RecipientTargetType,
        targetId: targetId ?? null,
        email: email ?? null,
        phone: phone ?? null,
      });
    } catch (error) {
      if (error instanceof RecipientTargetNotFoundError) {
        return apiError(res, 404, 'NOT_FOUND', error.message);
      }
      console.error('Error resolving recipients in /communication/send:', error);
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to resolve recipients', String(error));
    }

    if (resolution.sendableRecipients === 0) {
      return apiError(res, 422, 'NO_SENDABLE_RECIPIENTS', 'No sendable recipients for this target', {
        resolution,
      });
    }

    if (isBulkTarget(targetType as RecipientTargetType) && !confirm) {
      return apiError(res, 409, 'CONFIRMATION_REQUIRED', 'Bulk send requires explicit confirmation', {
        resolution,
      });
    }

    let sent = 0;
    const failures: { contact: string; error: string }[] = [];

    for (const recipient of resolution.recipients) {
      try {
        if (channel === 'email') {
          await sendManualEmailForOrg({
            channel: 'email',
            recipient: recipient.contact,
            subject: subject!,
            body,
            orgId,
            relatedReservationId: recipient.reservationId ?? resolution.relatedReservationId,
            relatedDepartureId: recipient.departureId ?? resolution.relatedDepartureId,
          });
        } else {
          await sendManualSmsForOrg({
            channel: 'sms',
            recipient: recipient.contact,
            body,
            orgId,
            relatedReservationId: recipient.reservationId ?? resolution.relatedReservationId,
            relatedDepartureId: recipient.departureId ?? resolution.relatedDepartureId,
          });
        }
        sent += 1;
      } catch (error: any) {
        const mapped = mapDeliveryError(error?.message);
        if (mapped && sent === 0 && failures.length === 0) {
          // Configuration errors abort the whole batch — surface them directly.
          return apiError(res, mapped.status, mapped.code, error.message);
        }
        failures.push({ contact: recipient.contact, error: String(error?.message || error) });
      }
    }

    return res.json({
      success: true,
      channel,
      targetType,
      sent,
      failed: failures.length,
      failures,
      resolution,
    });
  },
);

export default router;
