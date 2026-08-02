import { Router, type Response, type Request } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { logAuditEntry } from '../middleware/auditLogger';
import { z } from 'zod';
import {
  mergeWithDefaults,
  type DocType,
  type DocTemplateConfig,
  type TemplateConfig,
} from '../lib/pdfTemplateConfig';

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

/**
 * Persistence layer for the block-based PDF template editor.
 *
 * The block vocabulary lives in ../lib/pdfTemplateConfig and is shared with the
 * PDF renderer and (as a verbatim duplicate) the admin editor. This route must
 * round-trip that shape losslessly: the previous local schema here
 * (id/type/label/style with a 10-value `type` union) silently dropped `key` and
 * `customText` on every save, which is why the editor was write-only and the
 * generators could never resolve a block.
 */
function validateDocTemplateConfig(docType: DocType, input: any): DocTemplateConfig {
  return mergeWithDefaults({ [docType]: input } as Partial<TemplateConfig>)[docType];
}

function isDocType(value: string): value is DocType {
  return value === 'invoice' || value === 'voucher' || value === 'contract' || value === 'receipt';
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
    // mergeWithDefaults fills every doc type, preserves stored block order, and
    // appends blocks added by later schema upgrades.
    const configs = mergeWithDefaults(raw);

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

    const configs = mergeWithDefaults(input);

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

  if (!isDocType(docType)) {
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
      config: validateDocTemplateConfig(docType, docConfig),
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

  if (!isDocType(docType)) {
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

    const validated = validateDocTemplateConfig(docType, req.body);
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

  if (!isDocType(docType)) {
    return apiError(res, 400, "INVALID_DOC_TYPE", "Valid types: invoice, voucher, contract, receipt");
  }

  try {
    const { data } = await supabaseAdmin
      .from('org_branding')
      .select('pdf_template_config')
      .eq('org_id', orgId)
      .single();

    const allConfigs = (data?.pdf_template_config as any) || {};
    const config = validateDocTemplateConfig(docType, allConfigs[docType]);

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
