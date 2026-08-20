import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { auditLog } from '../middleware/auditLogger';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';

const router = Router();
const supplierCategories = ['accommodation', 'transport', 'airline', 'guide', 'activity', 'restaurant', 'insurance', 'visa', 'ticket', 'venue', 'equipment', 'other'] as const;
const serviceCategories = ['accommodation', 'transport', 'flight', 'guide', 'activity', 'meal', 'insurance', 'visa', 'ticket', 'venue', 'equipment', 'other'] as const;
const serviceUnits = ['per_person', 'per_room', 'per_night', 'per_vehicle', 'per_group', 'per_booking', 'per_day', 'per_hour', 'fixed'] as const;

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(180),
  category: z.enum(supplierCategories).default('other'),
  status: z.enum(['active', 'inactive']).default('active'),
  country: z.string().trim().max(100).optional().nullable(), city: z.string().trim().max(100).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(), taxId: z.string().trim().max(80).optional().nullable(),
  contactName: z.string().trim().max(150).optional().nullable(), email: z.string().email().optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(), website: z.string().url().optional().nullable(),
  defaultCurrency: z.string().length(3).default('BAM'), paymentTerms: z.string().trim().max(500).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(180), category: z.enum(serviceCategories).default('other'),
  unit: z.enum(serviceUnits).default('fixed'), netPrice: z.number().min(0), currency: z.string().length(3).default('BAM'),
  taxRate: z.number().min(0).max(100).default(0), defaultMarkup: z.number().min(0).max(1000).default(0),
  validFrom: z.string().date().optional().nullable(), validTo: z.string().date().optional().nullable(),
  minQuantity: z.number().min(0).optional().nullable(), maxQuantity: z.number().min(0).optional().nullable(),
  active: z.boolean().default(true), notes: z.string().max(4000).optional().nullable(),
});

const clean = (value: string | null | undefined) => value || null;
const transformService = (row: any) => ({
  id: row.id, supplierId: row.supplier_id, name: row.name, category: row.category, unit: row.unit,
  netPrice: Number(row.net_price), currency: row.currency, taxRate: Number(row.tax_rate), defaultMarkup: Number(row.default_markup),
  validFrom: row.valid_from, validTo: row.valid_to, minQuantity: row.min_quantity === null ? null : Number(row.min_quantity),
  maxQuantity: row.max_quantity === null ? null : Number(row.max_quantity), active: row.active, notes: row.notes,
  createdAt: row.created_at, updatedAt: row.updated_at,
});
const transformSupplier = (row: any, services: any[] = []) => ({
  id: row.id, name: row.name, category: row.category, status: row.status, country: row.country, city: row.city,
  address: row.address, taxId: row.tax_id, contactName: row.contact_name, email: row.email, phone: row.phone,
  website: row.website, defaultCurrency: row.default_currency, paymentTerms: row.payment_terms, notes: row.notes,
  services: services.map(transformService), createdAt: row.created_at, updatedAt: row.updated_at,
});

router.get('/suppliers', authenticateToken, requireOrgContext, requireMinimumRole('viewer'), async (req, res: Response) => {
  const parsed = z.object({ search: z.string().optional(), category: z.enum(supplierCategories).optional(), status: z.enum(['active', 'inactive']).optional() }).safeParse(req.query);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid supplier filters');
  let query = supabaseAdmin.from('suppliers').select('*').eq('org_id', req.orgId!).order('name');
  if (parsed.data.category) query = query.eq('category', parsed.data.category);
  if (parsed.data.status) query = query.eq('status', parsed.data.status);
  if (parsed.data.search?.trim()) {
    const term = parsed.data.search.trim();
    query = query.or(`name.ilike.%${term}%,city.ilike.%${term}%,contact_name.ilike.%${term}%`);
  }
  const { data: suppliers, error } = await query;
  if (error) return handleSupabaseError(res, error, 'Failed to load suppliers');
  const ids = (suppliers || []).map((row) => row.id);
  const { data: services, error: servicesError } = ids.length
    ? await supabaseAdmin.from('supplier_services').select('*').eq('org_id', req.orgId!).in('supplier_id', ids).order('name')
    : { data: [], error: null };
  if (servicesError) return handleSupabaseError(res, servicesError, 'Failed to load supplier services');
  return res.json({ data: (suppliers || []).map((supplier) => transformSupplier(supplier, (services || []).filter((service) => service.supplier_id === supplier.id))) });
});

router.post('/suppliers', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('CREATE', 'supplier'), async (req, res: Response) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid supplier', parsed.error.issues);
  const b = parsed.data;
  const { data, error } = await supabaseAdmin.from('suppliers').insert({
    org_id: req.orgId!, name: b.name, category: b.category, status: b.status, country: clean(b.country), city: clean(b.city),
    address: clean(b.address), tax_id: clean(b.taxId), contact_name: clean(b.contactName), email: clean(b.email), phone: clean(b.phone),
    website: clean(b.website), default_currency: b.defaultCurrency, payment_terms: clean(b.paymentTerms), notes: clean(b.notes),
  }).select('*').single();
  if (error) return handleSupabaseError(res, error, 'Failed to create supplier');
  return res.status(201).json(transformSupplier(data));
});

router.patch('/suppliers/:id', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('UPDATE', 'supplier', (req) => req.params.id), async (req, res: Response) => {
  const parsed = supplierSchema.partial().safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid supplier update', parsed.error.issues);
  const fields: Record<string, string> = { taxId: 'tax_id', contactName: 'contact_name', defaultCurrency: 'default_currency', paymentTerms: 'payment_terms' };
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(parsed.data)) updates[fields[key] || key] = typeof value === 'string' ? clean(value) : value;
  const { data, error } = await supabaseAdmin.from('suppliers').update(updates).eq('id', req.params.id).eq('org_id', req.orgId!).select('*').single();
  if (error) return handleSupabaseError(res, error, 'Failed to update supplier');
  return res.json(transformSupplier(data));
});

router.post('/suppliers/:supplierId/services', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('CREATE', 'supplier_service'), async (req, res: Response) => {
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid supplier service', parsed.error.issues);
  const { data: supplier } = await supabaseAdmin.from('suppliers').select('id').eq('id', req.params.supplierId).eq('org_id', req.orgId!).maybeSingle();
  if (!supplier) return apiError(res, 404, 'NOT_FOUND', 'Supplier not found');
  const b = parsed.data;
  const { data, error } = await supabaseAdmin.from('supplier_services').insert({
    org_id: req.orgId!, supplier_id: supplier.id, name: b.name, category: b.category, unit: b.unit, net_price: b.netPrice,
    currency: b.currency, tax_rate: b.taxRate, default_markup: b.defaultMarkup, valid_from: b.validFrom || null,
    valid_to: b.validTo || null, min_quantity: b.minQuantity ?? null, max_quantity: b.maxQuantity ?? null,
    active: b.active, notes: clean(b.notes),
  }).select('*').single();
  if (error) return handleSupabaseError(res, error, 'Failed to create supplier service');
  return res.status(201).json(transformService(data));
});

router.patch('/supplier-services/:id', authenticateToken, requireOrgContext, requireMinimumRole('agent'), auditLog('UPDATE', 'supplier_service', (req) => req.params.id), async (req, res: Response) => {
  const parsed = serviceSchema.partial().safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid service update', parsed.error.issues);
  const fields: Record<string, string> = { netPrice: 'net_price', taxRate: 'tax_rate', defaultMarkup: 'default_markup', validFrom: 'valid_from', validTo: 'valid_to', minQuantity: 'min_quantity', maxQuantity: 'max_quantity' };
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(parsed.data)) updates[fields[key] || key] = typeof value === 'string' ? clean(value) : value;
  const { data, error } = await supabaseAdmin.from('supplier_services').update(updates).eq('id', req.params.id).eq('org_id', req.orgId!).select('*').single();
  if (error) return handleSupabaseError(res, error, 'Failed to update supplier service');
  return res.json(transformService(data));
});

export default router;
