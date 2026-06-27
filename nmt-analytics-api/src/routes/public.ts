import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { z } from 'zod';
import { apiError } from '../lib/errors';

const router = Router();

// Public route - no auth required
// Returns HTML snippet that agencies embed on their site

const WIDGET_CSS = `
:root { --nmt-primary: #6366f1; --nmt-bg: #ffffff; --nmt-text: #1f2937; --nmt-border: #e5e7eb; }
.nmt-widget * { box-sizing: border-box; margin: 0; padding: 0; }
.nmt-widget { font-family: system-ui, sans-serif; background: var(--nmt-bg); border: 1px solid var(--nmt-border); border-radius: 12px; padding: 24px; max-width: 400px; color: var(--nmt-text); }
.nmt-widget h2 { font-size: 18px; font-weight: 700; margin-bottom: 16px; }
.nmt-widget label { font-size: 13px; font-weight: 600; display: block; margin-top: 12px; margin-bottom: 4px; }
.nmt-widget select, .nmt-widget input { width: 100%; padding: 10px 12px; border: 1px solid var(--nmt-border); border-radius: 8px; font-size: 14px; background: #fff; }
.nmt-widget button { width: 100%; margin-top: 16px; padding: 12px; background: var(--nmt-primary); color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }
.nmt-widget button:disabled { opacity: 0.5; cursor: not-allowed; }
.nmt-widget .nmt-error { color: #ef4444; font-size: 13px; margin-top: 8px; }
.nmt-widget .nmt-success { color: #22c55e; font-size: 14px; text-align: center; padding: 20px; }
`;

const WIDGET_HTML = `
<!DOCTYPE html>
<html lang="bs">
<head><style>${WIDGET_CSS}</style></head>
<body>
<div class="nmt-widget" id="nmt-widget-root">
  <h2>Rezervišite putovanje</h2>
  <div id="nmt-step-1">
    <label>Odaberite aranžman</label>
    <select id="nmt-package"><option value="">Učitavanje...</option></select>
    <label>Datum polaska</label>
    <select id="nmt-departure" disabled><option value="">Prvo odaberite aranžman</option></select>
    <label>Broj osoba</label>
    <input type="number" id="nmt-party" value="2" min="1" max="20" />
    <label>Ime i prezime</label>
    <input type="text" id="nmt-name" placeholder="Vaše ime i prezime" />
    <label>Telefon</label>
    <input type="tel" id="nmt-phone" placeholder="+387 61 234 567" />
    <div id="nmt-error" class="nmt-error"></div>
    <button id="nmt-submit" onclick="nmtSubmit()">Pošaljite upit</button>
  </div>
  <div id="nmt-success" class="nmt-success" style="display:none">
    ✓ Vaš upit je poslan. Kontaktirat ćemo vas uskoro.
  </div>
</div>
<script>
window.NMT_ORG_ID = '__ORG_ID__';

async function nmtFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Greška u učitavanju');
  return r.json();
}

async function nmtLoadPackages() {
  try {
    const pkgs = await nmtFetch('/api/public/' + window.NMT_ORG_ID + '/packages');
    const sel = document.getElementById('nmt-package');
    sel.innerHTML = '<option value="">Izaberite aranžman</option>';
    pkgs.forEach(p => {
      sel.innerHTML += '<option value="' + p.id + '">' + p.name + ' - ' + p.destination + ' (' + p.basePrice + ' BAM)</option>';
    });
    sel.disabled = false;
  } catch(e) { document.getElementById('nmt-error').textContent = 'Greška pri učitavanju aranžmana.'; }
}

async function nmtLoadDepartures(packageId) {
  try {
    const deps = await nmtFetch('/api/public/' + window.NMT_ORG_ID + '/departures?packageId=' + packageId);
    const sel = document.getElementById('nmt-departure');
    sel.innerHTML = '<option value="">Izaberite datum</option>';
    deps.filter(d => d.status === 'active' && d.booked < d.capacity).forEach(d => {
      sel.innerHTML += '<option value="' + d.id + '">' + new Date(d.departAt).toLocaleDateString('bs-BA') + ' (' + (d.capacity - d.booked) + ' mjesta)</option>';
    });
    sel.disabled = false;
  } catch(e) { document.getElementById('nmt-error').textContent = 'Greška pri učitavanju datuma.'; }
}

document.addEventListener('DOMContentLoaded', () => {
  nmtLoadPackages();
  document.getElementById('nmt-package').addEventListener('change', function() {
    if (this.value) nmtLoadDepartures(this.value);
  });
});

async function nmtSubmit() {
  const btn = document.getElementById('nmt-submit');
  btn.disabled = true;
  const errEl = document.getElementById('nmt-error');
  errEl.textContent = '';

  try {
    const payload = {
      orgId: window.NMT_ORG_ID,
      packageId: document.getElementById('nmt-package').value,
      departureId: document.getElementById('nmt-departure').value,
      partySize: parseInt(document.getElementById('nmt-party').value) || 2,
      customerName: document.getElementById('nmt-name').value,
      customerPhone: document.getElementById('nmt-phone').value,
    };

    if (!payload.packageId || !payload.departureId || !payload.customerName || !payload.customerPhone) {
      throw new Error('Molimo popunite sva polja.');
    }

    const r = await fetch('/api/public/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || 'Greška pri slanju.');

    document.getElementById('nmt-step-1').style.display = 'none';
    document.getElementById('nmt-success').style.display = 'block';
  } catch(e) {
    errEl.textContent = e.message;
    btn.disabled = false;
  }
}
</script>
</body>
</html>
`;

// GET /api/public/:orgId/widget — returns embeddable HTML
router.get('/public/:orgId/widget', async (req: Request, res: Response) => {
  const { orgId } = req.params;

  // Verify org exists
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .single();

  if (!org) {
    return apiError(res, 404, 'ORG_NOT_FOUND', 'Organization not found');
  }

  let html = WIDGET_HTML;
  // Replace placeholder with actual org ID
  html = html.replace(/__ORG_ID__/g, orgId);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// GET /api/public/:orgId/packages — public packages list
router.get('/public/:orgId/packages', async (req: Request, res: Response) => {
  const { orgId } = req.params;

  const { data: packages, error } = await supabaseAdmin
    .from('packages')
    .select('id, name, destination, base_price, duration_days, currency')
    .eq('org_id', orgId)
    .order('name');

  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to load packages');

  const transformed = (packages || []).map(p => ({
    id: p.id,
    name: p.name,
    destination: p.destination,
    basePrice: p.base_price,
    durationDays: p.duration_days,
    currency: p.currency,
  }));

  res.json(transformed);
});

// GET /api/public/:orgId/departures — public departures for a package
router.get('/public/:orgId/departures', async (req: Request, res: Response) => {
  const { orgId } = req.params;
  const packageId = req.query.packageId as string;

  let query = supabaseAdmin
    .from('departures')
    .select('id, depart_at, return_at, capacity, booked, status, package_id')
    .eq('org_id', orgId)
    .gte('depart_at', new Date().toISOString())
    .order('depart_at');

  if (packageId) {
    query = query.eq('package_id', packageId);
  }

  const { data, error } = await query;
  if (error) return apiError(res, 500, 'DB_ERROR', 'Failed to load departures');

  const transformed = (data || []).map(d => ({
    id: d.id,
    packageId: d.package_id,
    departAt: d.depart_at,
    returnAt: d.return_at,
    capacity: d.capacity,
    booked: d.booked,
    status: d.status,
  }));

  res.json(transformed);
});

// POST /api/public/reserve — public reservation (no auth)
const publicReservationSchema = z.object({
  orgId: z.string().uuid(),
  departureId: z.string().uuid(),
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  partySize: z.number().int().min(1).max(20).default(2),
});

router.post('/public/reserve', async (req: Request, res: Response) => {
  try {
    const input = publicReservationSchema.parse(req.body);

    // Call the atomic RPC
    const { data, error } = await supabaseAdmin.rpc('create_reservation_atomic', {
      p_org_id: input.orgId,
      p_departure_id: input.departureId,
      p_customer_data: JSON.stringify({
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        reservationAt: new Date().toISOString(),
      }),
      p_party_size: input.partySize,
      p_status: 'pending',
    });

    if (error) {
      if (error.message?.includes('CAPACITY_FULL')) {
        return apiError(res, 400, 'CAPACITY_FULL', 'Nažalost, ovaj polazak je popunjen.');
      }
      return apiError(res, 500, 'RESERVATION_FAILED', 'Greška pri kreiranju rezervacije.');
    }

    res.status(201).json({ success: true, message: 'Rezervacija primljena' });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Molimo popunite sva obavezna polja.');
    }
    return apiError(res, 500, 'INTERNAL_ERROR', 'Interna greška.');
  }
});

export default router;
