import { beforeAll, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({ signed: false }));
const id = '22222222-2222-4222-8222-222222222222';
vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: any, _res: any, next: any) => { req.user = { id: 'actor', role: 'manager' }; next(); },
}));
vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: any, _res: any, next: any) => { req.orgId = 'own'; next(); },
}));
vi.mock('../middleware/auditLogger', () => ({ auditLog: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('../lib/orgBranding', () => ({
  getOrgBranding: vi.fn(async () => ({ primaryColor: '#1D4ED8', footerText: 'Synthetic footer ČĆŠŽĐ' })),
}));
vi.mock('../lib/supabase', () => ({
  handleSupabaseError: (res: any) => res.sendStatus(500),
  supabaseAdmin: { from: () => {
    const query: any = {};
    query.select = () => query; query.eq = () => query;
    query.single = async () => ({ data: {
      id, org_id: 'own', passenger_name_snapshot: 'Synthetic ČĆŠŽĐ\r\nUnsafe filename',
      package_name_snapshot: 'Synthetic package', destination_snapshot: 'Synthetic',
      template_snapshot_title: 'Synthetic pristanak ČĆŠŽĐ', template_snapshot_body: 'Synthetic consent terms.',
      status: state.signed ? 'signed' : 'pending', consumed_at: state.signed ? '2044-01-01T10:00:00Z' : null,
      created_at: '2044-01-01T08:00:00Z', signed_at: state.signed ? '2044-01-01T10:00:00Z' : null,
      signer_name: 'Synthetic signer ČĆŠŽĐ', signed_via: 'web',
    }, error: null });
    return query;
  } },
}));
let app: express.Express;
beforeAll(async () => {
  app = express(); app.use(express.json()); app.use('/api', (await import('../routes/waivers')).default);
});
it.each([false, true])('renders consent PDF with Unicode branding/footer when signed=%s', async signed => {
  state.signed = signed;
  const response = await request(app).get('/api/waivers/' + id + '/pdf');
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('application/pdf');
  expect(response.headers['content-disposition']).toBe('attachment; filename="waiver_' + id + '.pdf"');
  expect(Buffer.isBuffer(response.body)).toBe(true);
  expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
  expect(response.body.length).toBeGreaterThan(1000);
});
