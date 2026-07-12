import { Router, type Response, type Request } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { logAuditEntry } from '../middleware/auditLogger';
import { z } from 'zod';

const router = Router({ mergeParams: true });

router.use(authenticateToken);
router.use(requireOrgContext);
router.use(requireMinimumRole('director'));

// =====================
// ONBOARDING STATUS
// =====================

const ONBOARDING_STEPS = [
  { key: 'agency_name', label: 'Postavite naziv agencije', required: true },
  { key: 'currency', label: 'Postavite valutu', required: true },
  { key: 'logo', label: 'Dodajte logo agencije', required: true },
  { key: 'first_package', label: 'Kreirajte prvi aranžman', required: true },
  { key: 'first_departure', label: 'Dodajte prvi termin (polazak)', required: true },
  { key: 'first_reservation', label: 'Kreirajte prvu rezervaciju', required: true },
  { key: 'branding_colors', label: 'Prilagodite boje dokumenata', required: false },
  { key: 'team_member', label: 'Pozovite člana tima', required: false },
] as const;

// GET /onboarding/status — checklist + completion
router.get('/status', async (req: Request, res: Response) => {
  const orgId = req.orgId!;

  try {
    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .select('id, name, currency')
      .eq('id', orgId)
      .single();

    if (orgErr || !org) {
      return apiError(res, 404, "NOT_FOUND", "Organization not found");
    }

    // Fetch branding from org_branding table (separate from organizations)
    let brandingRow: { logo_url?: string | null; primary_color?: string | null } | null = null;
    try {
      const { data: br } = await supabaseAdmin
        .from('org_branding')
        .select('logo_url, primary_color')
        .eq('org_id', orgId)
        .single();
      brandingRow = br;
    } catch {
      // No branding row yet — defaults
    }

    let packagesCount = 0;
    let departuresCount = 0;
    let reservationsCount = 0;
    let teamCount = 0;

    try {
      const [pk, dp, rt, tm] = await Promise.all([
        supabaseAdmin.from('packages').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
        supabaseAdmin.from('departures').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
        supabaseAdmin.from('reservations').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
        supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      ]);
      packagesCount = pk.count || 0;
      departuresCount = dp.count || 0;
      reservationsCount = rt.count || 0;
      teamCount = tm.count || 0;
    } catch {
      // Some tables may not exist; count stays 0
    }

    const steps = ONBOARDING_STEPS.map(s => {
      let completed = false;
      switch (s.key) {
        case 'agency_name': completed = !!org.name; break;
        case 'currency': completed = !!org.currency; break;
        case 'logo': completed = !!brandingRow?.logo_url; break;
        case 'branding_colors': completed = !!brandingRow?.primary_color; break;
        case 'first_package': completed = packagesCount > 0; break;
        case 'first_departure': completed = departuresCount > 0; break;
        case 'first_reservation': completed = reservationsCount > 0; break;
        case 'team_member': completed = teamCount > 1; break;
      }
      return { ...s, completed };
    });

    const completedCount = steps.filter(s => s.completed).length;
    const totalCount = steps.length;
    const percentage = Math.round((completedCount / totalCount) * 100);
    const isComplete = steps.filter(s => s.required).every(s => s.completed);

    return res.json({
      steps,
      completed: completedCount,
      total: totalCount,
      percentage,
      isComplete,
    });
  } catch (err) {
    console.error('[ONBOARDING] Exception:', err);
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// POST /onboarding/skip — mark onboarding as skipped (persist flag)
router.post('/skip', async (req: Request, res: Response) => {
  const orgId = req.orgId!;

  try {
    const { error } = await supabaseAdmin
      .from('organizations')
      .update({ onboarding_skipped: true })
      .eq('id', orgId);

    if (error) {
      return apiError(res, 500, "INTERNAL_ERROR", "Failed to skip onboarding");
    }

    await logAuditEntry({
      org_id: orgId,
      user_id: req.user!.id,
      action: 'UPDATE',
      entity: 'onboarding',
      entity_id: 'skip',
      metadata: { skipped: true },
    });

    return res.json({ skipped: true });
  } catch (err) {
    console.error('[ONBOARDING] Skip exception:', err);
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// =====================
// PDF TEMPLATE EDITOR
// =====================

interface TemplateBlock {
  id: string;
  type: 'header' | 'logo' | 'trip_info' | 'passenger_table' | 'pricing' | 'qr_code' | 'terms' | 'footer' | 'signature' | 'spacer';
  enabled: boolean;
  label: string;
  style: { [key: string]: any };
}

interface PDFTemplateConfig {
  blocks: TemplateBlock[];
  pageSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  margins: { top: number; bottom: number; left: number; right: number };
  fontFamily: string;
  accentColor: string;
}

const DEFAULT_TEMPLATE: PDFTemplateConfig = {
  pageSize: 'A4',
  orientation: 'portrait',
  margins: { top: 50, bottom: 50, left: 50, right: 50 },
  fontFamily: 'DejaVu',
  accentColor: '#1D4ED8',
  blocks: [
    { id: 'b1', type: 'header', enabled: true, label: 'Zaglavlje sa nazivom agencije', style: {} },
    { id: 'b2', type: 'logo', enabled: true, label: 'Logo agencije', style: { position: 'right', maxWidth: 120 } },
    { id: 'b3', type: 'trip_info', enabled: true, label: 'Podaci o putovanju', style: {} },
    { id: 'b4', type: 'passenger_table', enabled: true, label: 'Tabela putnika', style: { alternatingRows: true } },
    { id: 'b5', type: 'pricing', enabled: true, label: 'Cijena i naplata', style: {} },
    { id: 'b6', type: 'qr_code', enabled: false, label: 'QR kod (link)', style: { size: 80 } },
    { id: 'b7', type: 'terms', enabled: true, label: 'Opšti uslovi', style: {} },
    { id: 'b8', type: 'signature', enabled: true, label: 'Potpis klijenta', style: {} },
    { id: 'b9', type: 'footer', enabled: true, label: 'Podnožje', style: {} },
  ],
};

function validateTemplateConfig(input: any): PDFTemplateConfig {
  if (!input || typeof input !== 'object') return { ...DEFAULT_TEMPLATE };
  return {
    pageSize: input.pageSize === 'Letter' ? 'Letter' : 'A4',
    orientation: input.orientation === 'landscape' ? 'landscape' : 'portrait',
    margins: {
      top: Number(input.margins?.top) || 50,
      bottom: Number(input.margins?.bottom) || 50,
      left: Number(input.margins?.left) || 50,
      right: Number(input.margins?.right) || 50,
    },
    fontFamily: typeof input.fontFamily === 'string' ? input.fontFamily : 'DejaVu',
    accentColor: typeof input.accentColor === 'string' ? input.accentColor : '#1D4ED8',
    blocks: Array.isArray(input.blocks) ? input.blocks.map((b: any) => ({
      id: String(b.id || ''),
      type: String(b.type || 'spacer'),
      enabled: Boolean(b.enabled),
      label: String(b.label || ''),
      style: typeof b.style === 'object' && b.style !== null ? b.style : {},
    })) : DEFAULT_TEMPLATE.blocks,
  };
}

// GET /pdf-templates — bulk GET all template configs
router.get('/templates', async (req: Request, res: Response) => {
  const orgId = req.orgId!;

  try {
    const { data, error } = await supabaseAdmin
      .from('org_branding')
      .select('pdf_template_config')
      .eq('org_id', orgId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return apiError(res, 500, "INTERNAL_ERROR", "Failed to fetch templates");
    }

    const raw = (data?.pdf_template_config as Record<string, any>) || {};
    const configs: Record<string, PDFTemplateConfig> = {};
    for (const dt of ['invoice', 'voucher', 'contract', 'receipt']) {
      configs[dt] = raw[dt] ? validateTemplateConfig(raw[dt]) : { ...DEFAULT_TEMPLATE };
    }

    return res.json({ pdf_template_config: configs });
  } catch (err) {
    console.error('[PDF_TEMPLATES] GET all exception:', err);
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// PUT /pdf-templates — bulk PUT all template configs
router.put('/templates', async (req: Request, res: Response) => {
  const orgId = req.orgId!;

  try {
    const input = req.body?.pdf_template_config || req.body;
    if (!input || typeof input !== 'object') {
      return apiError(res, 400, "INVALID_INPUT", "Expected pdf_template_config object");
    }

    const configs: Record<string, any> = {};
    for (const dt of ['invoice', 'voucher', 'contract', 'receipt']) {
      configs[dt] = validateTemplateConfig(input[dt] || DEFAULT_TEMPLATE);
    }

    const { error: updateErr } = await supabaseAdmin
      .from('org_branding')
      .update({ pdf_template_config: configs, updated_at: new Date().toISOString() })
      .eq('org_id', orgId);

    if (updateErr) {
      const { error: insertErr } = await supabaseAdmin
        .from('org_branding')
        .insert({ org_id: orgId, pdf_template_config: configs });
      if (insertErr) {
        return apiError(res, 500, "INTERNAL_ERROR", "Failed to save templates");
      }
    }

    await logAuditEntry({
      org_id: orgId,
      user_id: req.user!.id,
      action: 'UPDATE',
      entity: 'pdf_template',
      entity_id: 'bulk',
      metadata: { docTypes: Object.keys(configs) },
    });

    return res.json({ pdf_template_config: configs, saved: true });
  } catch (err) {
    console.error('[PDF_TEMPLATES] PUT all exception:', err);
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// GET /pdf-templates/:docType — get template config for a given doc type
router.get('/templates/:docType', async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const docType = req.params.docType;
  const validDocTypes = ['invoice', 'voucher', 'contract', 'receipt'];

  if (!validDocTypes.includes(docType)) {
    return apiError(res, 400, "INVALID_DOC_TYPE", "Valid types: invoice, voucher, contract, receipt");
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('org_branding')
      .select('pdf_template_config')
      .eq('org_id', orgId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return apiError(res, 500, "INTERNAL_ERROR", "Failed to fetch template");
    }

    const allConfigs = (data?.pdf_template_config as any) || {};
    const docConfig = allConfigs[docType] || null;

    return res.json({
      docType,
      config: docConfig ? validateTemplateConfig(docConfig) : { ...DEFAULT_TEMPLATE },
      isDefault: !docConfig,
    });
  } catch (err) {
    console.error('[PDF_TEMPLATES] GET exception:', err);
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// PUT /pdf-templates/:docType — save template config for a doc type
router.put('/templates/:docType', async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const docType = req.params.docType;
  const validDocTypes = ['invoice', 'voucher', 'contract', 'receipt'];

  if (!validDocTypes.includes(docType)) {
    return apiError(res, 400, "INVALID_DOC_TYPE", "Valid types: invoice, voucher, contract, receipt");
  }

  try {
    // Fetch existing config
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('org_branding')
      .select('pdf_template_config')
      .eq('org_id', orgId)
      .single();

    if (fetchErr && fetchErr.code !== 'PGRST116') {
      return apiError(res, 500, "INTERNAL_ERROR", "Failed to fetch existing config");
    }

    const validated = validateTemplateConfig(req.body);
    const allConfigs = ((existing?.pdf_template_config as any) || {});
    allConfigs[docType] = validated;

    const { error: updateErr } = await supabaseAdmin
      .from('org_branding')
      .update({ pdf_template_config: allConfigs, updated_at: new Date().toISOString() })
      .eq('org_id', orgId);

    if (updateErr) {
      // Try insert if no row exists
      const { error: insertErr } = await supabaseAdmin
        .from('org_branding')
        .insert({ org_id: orgId, pdf_template_config: allConfigs });

      if (insertErr) {
        return apiError(res, 500, "INTERNAL_ERROR", "Failed to save template");
      }
    }

    await logAuditEntry({
      org_id: orgId,
      user_id: req.user!.id,
      action: 'UPDATE',
      entity: 'pdf_template',
      entity_id: docType,
      metadata: { docType, blocksCount: validated.blocks.length },
    });

    return res.json({ docType, config: validated, saved: true });
  } catch (err) {
    console.error('[PDF_TEMPLATES] PUT exception:', err);
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

// GET /pdf-templates/preview/:docType — preview template with mock data
router.get('/templates/preview/:docType', async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const docType = req.params.docType;

  try {
    const { data } = await supabaseAdmin
      .from('org_branding')
      .select('pdf_template_config')
      .eq('org_id', orgId)
      .single();

    const allConfigs = (data?.pdf_template_config as any) || {};
    const config = validateTemplateConfig(allConfigs[docType]);

    // Return a JSON preview structure for the frontend to render
    const mockData = {
      org: { name: 'Demo Travel Agency', address: 'Sarajevo, BiH', email: 'info@demo.ba', phone: '+387 33 000 000' },
      trip: { destination: 'Antalya, Turska', departure: '15.08.2026', return: '22.08.2026', duration: '7 noći' },
      passengers: [
        { name: 'Amer Hodić', passport: 'BH1234567', seat: '12A', paid: 1200, debt: 0 },
        { name: 'Selma Hodić', passport: 'BH7654321', seat: '12B', paid: 1200, debt: 0 },
      ],
      pricing: { total: 2400, currency: 'BAM', perPerson: 1200 },
      config,
    };

    return res.json(mockData);
  } catch (err) {
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

export default router;
