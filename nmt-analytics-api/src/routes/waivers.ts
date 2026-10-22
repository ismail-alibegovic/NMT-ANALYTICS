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
router.use('/public/waiver', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Audit wrappers (scoped to charter-person waiver entities)
const auditWaiverTemplateCreate = auditLog('CREATE', 'waiver_template', undefined, (req) => (req.body as any)?.title);
const auditWaiverTemplateUpdate = auditLog('UPDATE', 'waiver_template', (req) => req.params.id, (req) => (req.body as any)?.title);
const auditWaiverTemplateDelete = auditLog('DELETE', 'waiver_template', (req) => req.params.id);
const auditWaiverIssue          = auditLog('CREATE', 'waiver_token', undefined, (req) => `passenger:${(req.body as any)?.passenger_id}`);
const auditWaiverIssueBatch     = auditLog('CREATE', 'waiver_token', undefined, (req) => `batch:departure:${(req.body as any)?.departure_id}`);

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
    .select('id, title, body_text:body, declarations, is_active, created_at, updated_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) return handleSupabaseError(res, error, 'Failed to fetch waiver templates');
  return res.json(data);
});

const templateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body_text: z.string().trim().min(1).max(20000),
  is_active: z.boolean().optional(),
  declarations: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    label: z.string().trim().min(1).max(500),
    required: z.boolean().optional().default(false),
  })).max(20).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, 'Declaration IDs must be unique').optional(),
});

// POST /waiver-templates
router.post('/waiver-templates', auditWaiverTemplateCreate, async (req: any, res: Response) => {
  const orgId = req.orgId!;
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success)
    return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', parsed.error.issues);
  const { data, error } = await supabaseAdmin
    .from('waiver_templates')
    .insert({
      org_id: orgId,
      title: parsed.data.title,
      body: parsed.data.body_text,
      is_active: parsed.data.is_active ?? true,
      declarations: parsed.data.declarations || [],
    })
    .select('id, title, body_text:body, declarations, is_active, created_at, updated_at')
    .single();
  if (error?.code === '23505') return apiError(res, 409, 'TEMPLATE_EXISTS', 'An organization template already exists; edit it instead');
  if (error) return handleSupabaseError(res, error, 'Failed to create waiver template');
  return res.status(201).json(data);
});

// PATCH /waiver-templates/:id
router.patch('/waiver-templates/:id', auditWaiverTemplateUpdate, async (req: any, res: Response) => {
  const { id } = req.params;
  const orgId = req.orgId!;
  const parsed = templateSchema.partial().refine(value => Object.keys(value).length > 0).safeParse(req.body);
  if (!parsed.success)
    return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', parsed.error.issues);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.body_text !== undefined) update.body = parsed.data.body_text;
  if (parsed.data.is_active !== undefined) update.is_active = parsed.data.is_active;
  if (parsed.data.declarations !== undefined) update.declarations = parsed.data.declarations;
  const { data, error } = await supabaseAdmin
    .from('waiver_templates')
    .update(update)
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id, title, body_text:body, declarations, is_active, created_at, updated_at')
    .single();
  if (error) return handleSupabaseError(res, error, 'Failed to update waiver template');
  return res.json(data);
});

// DELETE /waiver-templates/:id
router.delete('/waiver-templates/:id', auditWaiverTemplateDelete, async (req: any, res: Response) => {
  const { id } = req.params;
  const orgId = req.orgId!;
  const { data, error } = await supabaseAdmin
    .from('waiver_templates')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId).select('id').maybeSingle();
  if (error?.code === '23503') return apiError(res, 409, 'TEMPLATE_IN_USE', 'Issued consent history references this template; deactivate it instead');
  if (error) return handleSupabaseError(res, error, 'Failed to delete waiver template');
  if (!data) return apiError(res, 404, 'NOT_FOUND', 'Waiver template not found');
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
      .select('id, title, body_text:body, declarations')
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
    .select('id, title, body_text:body, declarations')
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
  const { data: passenger, error: pErr } = await supabaseAdmin
    .from('excursion_passengers').select('id, full_name, reservation_id')
    .eq('id', passengerId).eq('org_id', orgId).single();
  if (pErr || !passenger) return { error: 'Passenger not found', status: 404 };

  const { data: reservation, error: rErr } = await supabaseAdmin
    .from('reservations').select('id, departure_id')
    .eq('id', passenger.reservation_id).eq('org_id', orgId).single();
  if (rErr || !reservation) return { error: 'Reservation not found', status: 404 };
  let departure: any = null;
  let pkg: any = null;
  if (reservation.departure_id) {
    const result = await supabaseAdmin.from('departures').select('id, package_id')
      .eq('id', reservation.departure_id).eq('org_id', orgId).single();
    if (result.error || !result.data) return { error: 'Departure not found', status: 404 };
    departure = result.data;
    if (departure.package_id) {
      const result = await supabaseAdmin.from('packages').select('id, name, destination')
        .eq('id', departure.package_id).eq('org_id', orgId).single();
      if (result.error || !result.data) return { error: 'Package not found', status: 404 };
      pkg = result.data;
    }
  }
  const now = new Date().toISOString();
  const expired = await supabaseAdmin.from('waiver_tokens').update({ revoked_at: now })
    .eq('org_id', orgId).eq('passenger_id', passengerId)
    .is('consumed_at', null).is('revoked_at', null).lte('expires_at', now);
  if (expired.error) return { error: 'Failed to expire prior waiver', status: 500 };

  // Generate secure token
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  // Snapshot the template body so changes to the template don't alter issued waivers

  const { data: waiver, error: wErr } = await supabaseAdmin
    .from('waiver_tokens')
    .insert({
      org_id: orgId,
      passenger_id: passengerId,
      template_id: template.id,
      template_snapshot_title: template.title,
      template_snapshot_body: template.body_text,
      template_snapshot_declarations: template.declarations || [],
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
  if (wErr) return { error: wErr.code === '23505' ? 'A pending waiver already exists; revoke it before reissuing' : 'Failed to issue waiver', status: wErr.code === '23505' ? 409 : 500 };

  return {
    id: waiver.id,
    waiver_id: waiver.id,
    passenger_id: passengerId,
    passenger_name: passenger.full_name,
    sign_url: `/waiver/${token}`,
    expires_at: waiver.expires_at,
  };
}

// POST /waivers/issue
router.post(
  '/waivers/issue',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  auditWaiverIssue,
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
    if ((result as any).error) return apiError(res, (result as any).status || 400, 'ISSUE_FAILED', (result as any).error);
    return res.status(201).json(result);
  },
);

// POST /waivers/issue-batch  — issue for all passengers without a pending waiver on a departure
router.post(
  '/waivers/issue-batch',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('manager'),
  auditWaiverIssueBatch,
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

    const reservations = await supabaseAdmin.from('reservations').select('id')
      .eq('org_id', orgId).eq('departure_id', parsed.data.departure_id);
    if (reservations.error) return handleSupabaseError(res, reservations.error, 'Failed to list reservations');
    const ids = (reservations.data || []).map(r => r.id);
    if (!ids.length) return res.json({ issued: 0, results: [] });
    const { data: passengers, error: pErr } = await supabaseAdmin
      .from('excursion_passengers').select('id, full_name')
      .eq('org_id', orgId).in('reservation_id', ids);
    if (pErr) return handleSupabaseError(res, pErr, 'Failed to list passengers');
    const passengerIds = (passengers || []).map(p => p.id);
    if (!passengerIds.length) return res.json({ issued: 0, results: [] });
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('waiver_tokens').select('passenger_id, revoked_at, consumed_at, expires_at')
      .eq('org_id', orgId).in('passenger_id', passengerIds);
    if (existingError) return handleSupabaseError(res, existingError, 'Failed to list existing waivers');
    const issuedSet = new Set((existing || []).filter(w => w.consumed_at ||
      (!w.revoked_at && new Date(w.expires_at).getTime() > Date.now())).map(w => w.passenger_id));

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
    return res.json({ issued: results.filter(r => !r.error).length, failed: results.filter(r => r.error).length, results });
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
        template_snapshot_title, passenger_id, reservation_id, revoked_at, consumed_at
      `,
      )
      .eq('org_id', orgId)
      .eq('departure_id', depId)
      .order('created_at', { ascending: true });
    if (error) return handleSupabaseError(res, error, 'Failed to fetch waivers');
    return res.json((data || []).map(issuerRecord));
  },
);


// Issuer views deliberately exclude capability hashes and signature image data.
const issuerFields = 'id, passenger_id, reservation_id, template_snapshot_title, passenger_name_snapshot, status, created_at, signed_at, expires_at, revoked_at, consumed_at';
function issuerRecord(row: any) {
  return {
    ...row,
    template_title: row.template_snapshot_title,
    status: row.revoked_at ? 'revoked' : row.consumed_at ? 'signed' :
      new Date(row.expires_at).getTime() <= Date.now() ? 'expired' : 'pending',
  };
}
router.get('/waivers', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req: any, res: Response) => {
  const result = await supabaseAdmin.from('waiver_tokens').select(issuerFields)
    .eq('org_id', req.orgId!).order('created_at', { ascending: false }).limit(500);
  if (result.error) return handleSupabaseError(res, result.error, 'Failed to list waivers');
  return res.json((result.data || []).map(issuerRecord));
});

router.get('/waivers/departures', authenticateToken, requireOrgContext, requireMinimumRole('agent'), async (req: any, res: Response) => {
  const orgId = req.orgId!;
  const departures = await supabaseAdmin.from('departures').select('id, depart_at, package_id')
    .eq('org_id', orgId).order('depart_at', { ascending: false }).limit(100);
  if (departures.error) return handleSupabaseError(res, departures.error, 'Failed to list departures');
  if (!departures.data?.length) return res.json([]);
  const departureIds = departures.data.map(d => d.id);
  const reservations = await supabaseAdmin.from('reservations').select('id, departure_id')
    .eq('org_id', orgId).in('departure_id', departureIds);
  if (reservations.error) return handleSupabaseError(res, reservations.error, 'Failed to list reservations');
  const reservationIds = (reservations.data || []).map(r => r.id);
  const passengers = reservationIds.length ? await supabaseAdmin.from('excursion_passengers')
    .select('id, full_name, reservation_id').eq('org_id', orgId).in('reservation_id', reservationIds) : { data: [], error: null };
  if (passengers.error) return handleSupabaseError(res, passengers.error, 'Failed to list passengers');
  const packageIds = [...new Set(departures.data.map(d => d.package_id).filter(Boolean))];
  const packages = packageIds.length ? await supabaseAdmin.from('packages').select('id, name, destination')
    .eq('org_id', orgId).in('id', packageIds) : { data: [], error: null };
  if (packages.error) return handleSupabaseError(res, packages.error, 'Failed to list packages');
  const packageMap = new Map<string, any>((packages.data || []).map((p: any): [string, any] => [p.id, p]));
  const reservationMap = new Map<string, string>((reservations.data || []).map((r: any): [string, string] => [r.id, r.departure_id]));
  return res.json(departures.data.map(d => {
    const pkg = packageMap.get(d.package_id);
    const rows = (passengers.data || []).filter(p => reservationMap.get(p.reservation_id) === d.id);
    return {
      id: d.id, depart_at: d.depart_at, package_name: pkg?.name || '', destination: pkg?.destination || '',
      passenger_count: rows.length,
      passengers: rows.map(p => ({ passengerId: p.id, fullName: p.full_name })),
    };
  }));
});

router.post('/waivers/:id/revoke', authenticateToken, requireOrgContext, requireMinimumRole('agent'),
  auditLog('UPDATE', 'waiver_token', req => req.params.id),
  async (req: any, res: Response) => {
    const orgId = req.orgId!;
    const existing = await supabaseAdmin.from('waiver_tokens').select('id, consumed_at, revoked_at')
      .eq('id', req.params.id).eq('org_id', orgId).maybeSingle();
    if (existing.error) return handleSupabaseError(res, existing.error, 'Failed to load waiver');
    if (!existing.data) return apiError(res, 404, 'NOT_FOUND', 'Waiver not found');
    if (existing.data.consumed_at) return apiError(res, 409, 'ALREADY_SIGNED', 'Signed consent cannot be revoked as an unused link');
    if (existing.data.revoked_at) return res.status(204).send();
    const result = await supabaseAdmin.from('waiver_tokens').update({ revoked_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('org_id', orgId).is('consumed_at', null).is('revoked_at', null)
      .select('id').maybeSingle();
    if (result.error) return handleSupabaseError(res, result.error, 'Failed to revoke waiver');
    if (!result.data) return apiError(res, 409, 'WAIVER_CONFLICT', 'The waiver changed during revocation');
    return res.status(204).send();
  });

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
      'id, passenger_name_snapshot, package_name_snapshot, destination_snapshot, template_snapshot_title, template_snapshot_body, template_snapshot_declarations, status, expires_at, revoked_at, consumed_at',
    )
    .eq('token_hash', tokenHash)
    .single();
  if (error || !data || data.revoked_at) return apiError(res, 404, 'NOT_FOUND', 'Waiver not found or invalid link');
  if (data.status === 'signed' || data.consumed_at)
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
    declarations: data.template_snapshot_declarations || [],
    expires_at: data.expires_at,
    status: data.status,
  });
});

const signSchema = z.object({
  signer_name: z.string().trim().min(1).max(200),
  signature_png: z.string().max(64000).regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .refine(value => Buffer.from(value, 'base64').subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Invalid PNG signature').optional(),
  declarations: z.record(z.string(), z.boolean()).optional().default({}),
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
    .select('id, org_id, status, expires_at, revoked_at, consumed_at, template_snapshot_declarations')
    .eq('token_hash', tokenHash)
    .single();
  if (wErr || !waiver || waiver.revoked_at) return apiError(res, 404, 'NOT_FOUND', 'Waiver not found');
  if (waiver.status === 'signed' || waiver.consumed_at)
    return apiError(res, 409, 'ALREADY_SIGNED', 'This waiver has already been signed');
  if (new Date(waiver.expires_at).getTime() < Date.now())
    return apiError(res, 410, 'EXPIRED', 'This waiver link has expired');

  const declarations = (waiver.template_snapshot_declarations || []) as Array<{ id: string; required?: boolean }>;
  if (declarations.some(item => item.required && parsed.data.declarations[item.id] !== true))
    return apiError(res, 400, 'DECLARATIONS_REQUIRED', 'Required declarations must be accepted');
  const acceptedAt = new Date().toISOString();

  const update: Record<string, unknown> = {
    status: 'signed',
    signed_at: acceptedAt,
    consumed_at: acceptedAt,
    declaration_answers: parsed.data.declarations,
    signer_name: parsed.data.signer_name,
    signed_via: 'web',
  };
  if (parsed.data.signature_png) {
    update.signature_png_base64 = parsed.data.signature_png;
  }

  // The capability is single-use and revocable at the instant of the write.
  const { data: signed, error } = await supabaseAdmin.from('waiver_tokens').update(update)
    .eq('id', waiver.id).eq('org_id', waiver.org_id).eq('status', waiver.status)
    .is('revoked_at', null).is('consumed_at', null).gt('expires_at', new Date().toISOString())
    .select('id').maybeSingle();
  if (error) return handleSupabaseError(res, error, 'Failed to sign waiver');
  if (!signed) return apiError(res, 409, 'WAIVER_CONFLICT', 'This waiver is no longer available for signing');

  // Passenger state and the public-capability audit entry commit with the token claim.
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

    if (!data.template_snapshot_body) return apiError(res, 409, 'SNAPSHOT_UNAVAILABLE', 'Historical waiver terms are unavailable');
    const branding = await getOrgBranding(orgId);

    // Inline PDF generation — keep light, no separate module yet
    const PDFDocument = (await import('pdfkit')).default;
    const { registerUnicodeFonts } = await import('../lib/pdfFonts.js');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    registerUnicodeFonts(doc);
    const buffers: Buffer[] = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const buf = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="waiver_${data.id}.pdf"`,
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
    if (data.status === 'signed' || data.consumed_at) {
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
      doc.fillColor('#9CA3AF').font('DejaVu-Oblique').text('Pristanak još nije potpisan.', 50, y);
    }
    // Footer with org display name
    if (branding.footerText) {
      doc
        .fillColor('#9CA3AF')
        .fontSize(8)
        .font('DejaVu-Oblique')
        .text(branding.footerText, 50, 780, { align: 'center', width: 495 });
    }
    doc.end();
  },
);

export default router;
