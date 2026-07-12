/**
 * Waiver routes — digital passenger consent for excursions.
 *
 * Admin (auth + org):
 *   GET    /waiver-templates              — list Templates for the org
 *   POST   /waiver-templates              — create Template
 *   PATCH  /waiver-templates/:id          — update Template
 *   DELETE /waiver-templates/:id          — delete Template
 *   POST   /waivers/issue                 — issue a Waiver token for one passenger
 *   POST   /waivers/issue-batch           — issue Waivers for all passengers on a departure
 *   GET    /waivers/by-departure/:depId   — list Waivers for a departure (issuer-side)
 *   GET    /waivers/:id/pdf               — download signed Waiver PDF
 *
 * Public (token-based, no auth):
 *   GET    /public/waiver/:token          — fetch Waiver payload for signing UI
 *   POST   /public/waiver/:token/sign     — submit signature (accepts typed name + optional PNG)
 */
import { Router, type Request, type Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { auditLog } from '../middleware/auditLogger';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { getOrgBranding } from '../lib/orgBranding';
import { z } from 'zod';
import crypto from 'node:crypto';

const router = Router();

// ── Admin: Waiver Templates ─────────────────────────────────────────────────
router.use(
  '/waiver-templates',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
);

// GET /waiver-templates
router.get('/waiver-templates', async (req: any, res: Response) => {
  const orgId = req.orgId!;
  const { data, error } = await supabaseAdmin
    .from('waiver_templates')
    .select('id, title, body_text, is_active, created_at, updated_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) return handleSupabaseError(res, error, 'Failed to fetch waiver templates');
  return res.json(data);
});

const templateSchema = z.object({
  title: z.string().min(1).max(200),
  body_text: z.string().min(1).max(20000),
  is_active: z.boolean().optional().default(true),
});

// POST /waiver-templates
router.post('/waiver-templates', async (req: any, res: Response) => {
  const orgId = req.orgId!;
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success)
    return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', parsed.error.issues);
  const { data, error } = await supabaseAdmin
    .from('waiver_templates')
    .insert({
      org_id: orgId,
      title: parsed.data.title,
      body_text: parsed.data.body_text,
      is_active: parsed.data.is_active,
    })
    .select()
    .single();
  if (error) return handleSupabaseError(res, error, 'Failed to create waiver template');
  return res.status(201).json(data);
});

// PATCH /waiver-templates/:id
router.patch('/waiver-templates/:id', async (req: any, res: Response) => {
  const { id } = req.params;
  const orgId = req.orgId!;
  const parsed = templateSchema.partial().safeParse(req.body);
  if (!parsed.success)
    return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', parsed.error.issues);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.body_text !== undefined) update.body_text = parsed.data.body_text;
  if (parsed.data.is_active !== undefined) update.is_active = parsed.data.is_active;
  const { data, error } = await supabaseAdmin
    .from('waiver_templates')
    .update(update)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single();
  if (error) return handleSupabaseError(res, error, 'Failed to update waiver template');
  return res.json(data);
});

// DELETE /waiver-templates/:id
router.delete('/waiver-templates/:id', async (req: any, res: Response) => {
  const { id } = req.params;
  const orgId = req.orgId!;
  const { error } = await supabaseAdmin
    .from('waiver_templates')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);
  if (error) return handleSupabaseError(res, error, 'Failed to delete waiver template');
  return res.status(204).send();
});

// ── Admin: Issue Waivers ────────────────────────────────────────────────────
const issueSchema = z.object({
  passenger_id: z.string().uuid(),
  template_id: z.string().uuid().optional(),
  expires_in_days: z.number().int().min(1).max(365).optional().default(30),
});

async function resolveTemplate(orgId: string, templateId?: string) {
  if (templateId) {
    const { data, error } = await supabaseAdmin
      .from('waiver_templates')
      .select('id, title, body_text')
      .eq('id', templateId)
      .eq('org_id', orgId)
      .eq('is_active', true)
      .single();
    if (error || !data) return null;
    return data;
  }
  // Default to the first active template for the org
  const { data } = await supabaseAdmin
    .from('waiver_templates')
    .select('id, title, body_text')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  return data || null;
}

async function issueForPassenger(
  passengerId: string,
  orgId: string,
  template: any,
  expiresInDays: number,
) {
  // Look up reservation → departure / passenger + customer email
  const { data: passenger, error: pErr } = await supabaseAdmin
    .from('excursion_passengers')
    .select(
      `
      id, full_name, phone,
      reservations ( id, customer_name, customer_phone, customer_email,
        departures ( id, depart_at, packages ( id, name, destination ) ) )
    `,
    )
    .eq('id', passengerId)
    .eq('org_id', orgId)
    .single();
  if (pErr || !passenger) return { error: 'Passenger not found' };

  const reservation = (passenger as any).reservations;
  const departure = reservation?.departures;
  const pkg = departure?.packages;

  // Generate secure token
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  // Snapshot the template body so changes to the template don't alter issued waivers
  const displayToken = `${token.slice(0, 8)}-${token.slice(8, 16)}-${token.slice(16, 24)}-${token.slice(24, 32)}`;

  const { data: waiver, error: wErr } = await supabaseAdmin
    .from('waiver_tokens')
    .insert({
      org_id: orgId,
      passenger_id: passengerId,
      template_id: template.id,
      template_snapshot_title: template.title,
      template_snapshot_body: template.body_text,
      passenger_name_snapshot: passenger.full_name,
      reservation_id: reservation?.id || null,
      departure_id: departure?.id || null,
      package_name_snapshot: pkg?.name || null,
      destination_snapshot: pkg?.destination || null,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select('id, created_at, expires_at')
    .single();
  if (wErr) return { error: 'Failed to issue waiver: ' + wErr.message };

  return {
    waiver_id: waiver.id,
    passenger_id: passengerId,
    passenger_name: passenger.full_name,
    sign_url: `/public/waiver/${displayToken}`,
    expires_at: waiver.expires_at,
  };
}

// POST /waivers/issue
router.post(
  '/waivers/issue',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  async (req: any, res: Response) => {
    const orgId = req.orgId!;
    const parsed = issueSchema.safeParse(req.body);
    if (!parsed.success)
      return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', parsed.error.issues);
    const template = await resolveTemplate(orgId, parsed.data.template_id);
    if (!template)
      return apiError(res, 404, 'TEMPLATE_NOT_FOUND', 'No active waiver template found for org');
    const result = await issueForPassenger(
      parsed.data.passenger_id,
      orgId,
      template,
      parsed.data.expires_in_days,
    );
    if ((result as any).error) return apiError(res, 400, 'ISSUE_FAILED', (result as any).error);
    return res.status(201).json(result);
  },
);

// POST /waivers/issue-batch  — issue for all passengers without a pending waiver on a departure
router.post(
  '/waivers/issue-batch',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  async (req: any, res: Response) => {
    const orgId = req.orgId!;
    const parsed = z
      .object({
        departure_id: z.string().uuid(),
        template_id: z.string().uuid().optional(),
        expires_in_days: z.number().int().min(1).max(365).optional().default(30),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', parsed.error.issues);

    // Find passengers on this departure
    const { data: passengers, error: pErr } = await supabaseAdmin
      .from('excursion_passengers')
      .select(
        `
        id, full_name,
        reservations ( id, departures ( id ) )
      `,
      )
      .eq('org_id', orgId)
      .eq('reservations.departure_id', parsed.data.departure_id);
    if (pErr) return handleSupabaseError(res, pErr, 'Failed to list passengers');

    // Existing pending waivers for these passengers
    const passengerIds = (passengers || []).map((p) => (p as any).id);
    const { data: existing } = await supabaseAdmin
      .from('waiver_tokens')
      .select('passenger_id')
      .in('passenger_id', passengerIds.length ? passengerIds : ['00000000-0000-0000-0000-000000000000']);
    const issuedSet = new Set((existing || []).map((w) => (w as any).passenger_id));

    const template = await resolveTemplate(orgId, parsed.data.template_id);
    if (!template)
      return apiError(res, 404, 'TEMPLATE_NOT_FOUND', 'No active waiver template found for org');

    const results: any[] = [];
    for (const p of passengers || []) {
      if (issuedSet.has((p as any).id)) continue;
      results.push(
        await issueForPassenger(
          (p as any).id,
          orgId,
          template,
          parsed.data.expires_in_days,
        ),
      );
    }
    return res.json({ issued: results.length, results });
  },
);

// GET /waivers/by-departure/:depId — issuer-side status overview
router.get(
  '/waivers/by-departure/:depId',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  async (req: any, res: Response) => {
    const { depId } = req.params;
    const orgId = req.orgId!;
    const { data, error } = await supabaseAdmin
      .from('waiver_tokens')
      .select(
        `
        id, status, signed_at, expires_at, created_at,
        passenger_name_snapshot, package_name_snapshot, destination_snapshot,
        passengers ( id, seat_number, phone,
          reservations ( customer_email )
        )
      `,
      )
      .eq('org_id', orgId)
      .eq('departure_id', depId)
      .order('created_at', { ascending: true });
    if (error) return handleSupabaseError(res, error, 'Failed to fetch waivers');
    return res.json(data);
  },
);

// ── Public: signing surface ─────────────────────────────────────────────────
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// GET /public/waiver/:token
router.get('/public/waiver/:token', async (req: Request, res: Response) => {
  const tokenHash = hashToken(req.params.token);
  const { data, error } = await supabaseAdmin
    .from('waiver_tokens')
    .select(
      'id, passenger_name_snapshot, package_name_snapshot, destination_snapshot, template_snapshot_title, template_snapshot_body, status, expires_at',
    )
    .eq('token_hash', tokenHash)
    .single();
  if (error || !data) return apiError(res, 404, 'NOT_FOUND', 'Waiver not found or invalid link');
  if (data.status === 'signed')
    return apiError(res, 409, 'ALREADY_SIGNED', 'This waiver has already been signed');
  if (new Date(data.expires_at).getTime() < Date.now())
    return apiError(res, 410, 'EXPIRED', 'This waiver link has expired');
  // Strip token_hash / sensitive columns; return only what the signing UI needs
  return res.json({
    id: data.id,
    passenger_name: data.passenger_name_snapshot,
    package_name: data.package_name_snapshot,
    destination: data.destination_snapshot,
    template_title: data.template_snapshot_title,
    template_body: data.template_snapshot_body,
    expires_at: data.expires_at,
    status: data.status,
  });
});

const signSchema = z.object({
  signer_name: z.string().min(1).max(200),
  signature_png: z.string().optional(), // base64 PNG of a canvas signature, optional
  agreed: z.boolean().refine((v) => v === true, {
    message: 'Must agree to the terms',
  }),
});

// POST /public/waiver/:token/sign
router.post('/public/waiver/:token/sign', async (req: Request, res: Response) => {
  const parsed = signSchema.safeParse(req.body);
  if (!parsed.success)
    return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', parsed.error.issues);

  const tokenHash = hashToken(req.params.token);
  const { data: waiver, error: wErr } = await supabaseAdmin
    .from('waiver_tokens')
    .select('id, org_id, status, expires_at')
    .eq('token_hash', tokenHash)
    .single();
  if (wErr || !waiver) return apiError(res, 404, 'NOT_FOUND', 'Waiver not found');
  if (waiver.status === 'signed')
    return apiError(res, 409, 'ALREADY_SIGNED', 'This waiver has already been signed');
  if (new Date(waiver.expires_at).getTime() < Date.now())
    return apiError(res, 410, 'EXPIRED', 'This waiver link has expired');

  const update: Record<string, unknown> = {
    status: 'signed',
    signed_at: new Date().toISOString(),
    signer_name: parsed.data.signer_name,
    signed_via: 'web',
  };
  if (parsed.data.signature_png) {
    update.signature_png_base64 = parsed.data.signature_png;
  }

  const { error } = await supabaseAdmin.from('waiver_tokens').update(update).eq('id', waiver.id);
  if (error) return handleSupabaseError(res, error, 'Failed to sign waiver');

  return res.json({ ok: true, signed: true, signed_at: update.signed_at });
});

// ── Admin: signed Waiver PDF ────────────────────────────────────────────────
router.get(
  '/waivers/:id/pdf',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  async (req: any, res: Response) => {
    const { id } = req.params;
    const orgId = req.orgId!;
    const { data, error } = await supabaseAdmin
      .from('waiver_tokens')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();
    if (error || !data) return apiError(res, 404, 'NOT_FOUND', 'Waiver not found');

    const branding = await getOrgBranding(orgId);

    // Inline PDF generation — keep light, no separate module yet
    const PDFDocument = (await import('pdfkit')).default;
    const { registerUnicodeFonts } = await import('../lib/pdfFonts');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    registerUnicodeFonts(doc);
    const buffers: Buffer[] = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const buf = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="waiver_${(data.passenger_name_snapshot || 'passenger').replace(/\s+/g, '_')}.pdf"`,
      );
      res.send(buf);
    });
    doc.on('error', (err) => {
      console.error('Waiver PDF error:', err);
      apiError(res, 500, 'INTERNAL_ERROR', 'Failed to generate PDF', String(err));
    });

    const primary = branding.primaryColor || '#1D4ED8';
    // Header
    doc.rect(0, 0, 595.28, 70).fill(primary);
    doc.fillColor('#FFFFFF').fontSize(20).font('DejaVu-Bold').text('Pristanak putnika', 50, 26);
    // Passenger + trip summary
    doc.fillColor('#111827').fontSize(11).font('DejaVu');
    let y = 92;
    doc.font('DejaVu-Bold').text(`Putnik: ${data.passenger_name_snapshot || '—'}`, 50, y);
    y += 18;
    doc.font('DejaVu').text(`Aranžman: ${data.package_name_snapshot || '—'}`, 50, y);
    y += 16;
    doc.text(`Destinacija: ${data.destination_snapshot || '—'}`, 50, y);
    y += 16;
    doc.text(
      `Izdano: ${new Date(data.created_at).toLocaleString('bs-BA')}  |  Status: ${data.status === 'signed' ? 'Potpisano' : 'Na čekanju'}`,
      50,
      y,
    );
    y += 28;
    // Body
    doc.font('DejaVu-Bold').fontSize(13).text(data.template_snapshot_title || 'Pristanak', 50, y);
    y += 22;
    doc.font('DejaVu').fontSize(10).text(data.template_snapshot_body || '', 50, y, {
      width: 495,
      align: 'justify',
      lineGap: 4,
    });
    y = doc.y + 28;
    // Signature
    if (data.status === 'signed') {
      doc.font('DejaVu-Bold').text('Potpis:', 50, y);
      y += 18;
      doc.font('DejaVu').text(data.signer_name || '—', 70, y);
      y += 16;
      doc.fontSize(9).fillColor('#6B7280').text(
        `Potpisano: ${data.signed_at ? new Date(data.signed_at).toLocaleString('bs-BA') : '—'}  ·  Via: ${data.signed_via || 'web'}`,
        50,
        y,
      );
      // Embed signature PNG if present
      if (data.signature_png_base64) {
        try {
          const imgBuf = Buffer.from(data.signature_png_base64, 'base64');
          // Best-effort embedding — wrong image data just skips
          doc.image(imgBuf, 350, y - 18, { fit: [140, 60] });
        } catch {
          /* ignore bad signature image */
        }
      }
    } else {
      doc.fillColor('#9CA3AF').font('DejaVu-Italic').text('Pristanak još nije potpisan.', 50, y);
    }
    // Footer with org display name
    if (branding.footerText) {
      doc
        .fillColor('#9CA3AF')
        .fontSize(8)
        .font('DejaVu-Italic')
        .text(branding.footerText, 50, 780, { align: 'center', width: 495 });
    }
    doc.end();
  },
);

export default router;
