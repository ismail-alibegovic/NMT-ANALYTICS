import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { z } from 'zod';

const router = Router();
router.use(authenticateToken);
router.use(requireOrgContext);

const createLinkSchema = z.object({
  reservationId: z.string().uuid(),
  amount: z.number().positive().optional(),
  expiresInDays: z.number().int().min(1).max(90).default(30),
});

// POST /paylinks — create a short payment link
router.post('/', requireMinimumRole('agent'), async (req: Request, res: Response) => {
  try {
    const { reservationId, amount, expiresInDays } = createLinkSchema.parse(req.body);
    const orgId = req.orgId!;

    // Verify reservation exists and belongs to org
    const { data: reservation, error: resErr } = await supabaseAdmin
      .from('reservations')
      .select('id, total_amount, customer_name, currency')
      .eq('id', reservationId)
      .eq('org_id', orgId)
      .single();

    if (resErr || !reservation) {
      return apiError(res, 404, 'NOT_FOUND', 'Reservation not found');
    }

    const code = crypto.randomBytes(6).toString('base64url');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    const payAmount = amount || reservation.total_amount;

    const { data: link, error } = await supabaseAdmin
      .from('payment_links')
      .insert({
        org_id: orgId,
        reservation_id: reservationId,
        code,
        amount: payAmount,
        currency: reservation.currency || 'BAM',
        expires_at: expiresAt.toISOString(),
        created_by: req.user!.id,
      })
      .select()
      .single();

    if (error) throw error;

    const baseUrl = process.env.PUBLIC_URL || `https://${req.get('host') || 'localhost:3001'}`;
    const shortUrl = `${baseUrl}/api/public/pay/${code}`;

    return res.status(201).json({
      id: link.id,
      code: link.code,
      shortUrl,
      amount: payAmount,
      currency: link.currency,
      expiresAt: link.expires_at,
      customerName: reservation.customer_name,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid input', err.issues);
    }
    console.error('Error creating payment link:', err);
    return apiError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

// GET /paylinks — list payment links for org
router.get('/', requireMinimumRole('agent'), async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('payment_links')
      .select('*, reservations(customer_name, total_amount)')
      .eq('org_id', req.orgId!)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return res.json(data || []);
  } catch (err: any) {
    return apiError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

export default router;
