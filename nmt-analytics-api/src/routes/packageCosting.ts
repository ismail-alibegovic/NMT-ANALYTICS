import { Router, Response } from 'express';
import { z } from 'zod';
import { apiError } from '../lib/errors';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { auditLog } from '../middleware/auditLogger';
import { derivePackageCosting, packageCostCategories, packageCostUnits } from '../lib/packageCosting';
import { fromCents, multiplyMoneyToCents } from '../lib/money';

const router = Router();

const idSchema = z.string().uuid('Invalid ID');
const costItemSchema = z.object({
  category: z.enum(packageCostCategories).optional(),
  label: z.string().trim().min(1).max(160).optional(),
  supplierId: z.string().uuid().nullable().optional(),
  supplierServiceId: z.string().uuid().nullable().optional(),
  unit: z.enum(packageCostUnits).optional(),
  quantity: z.number().positive().optional(),
  unitCost: z.number().nonnegative().optional(),
  currency: z.string().trim().length(3).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const createCostItemSchema = costItemSchema.extend({
  category: z.enum(packageCostCategories),
  label: z.string().trim().min(1).max(160),
  unit: z.enum(packageCostUnits).default('fixed'),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  currency: z.string().trim().length(3),
});

function serviceCategoryToCostCategory(category: string | null | undefined) {
  if (category === 'accommodation') return 'hotel';
  if (category === 'activity') return 'tour';
  if (category === 'guide' || category === 'meal' || category === 'visa' || category === 'ticket' || category === 'venue' || category === 'equipment') return 'supplier';
  if (category === 'transport' || category === 'flight' || category === 'insurance') return category;
  return 'other';
}

function transformCostItem(row: any) {
  const quantity = Number(row.quantity || 0);
  const unitCost = Number(row.unit_cost || 0);
  return {
    id: row.id,
    packageId: row.package_id,
    category: row.category,
    label: row.label,
    supplierId: row.supplier_id,
    supplierName: row.suppliers?.name || row.supplier_services?.suppliers?.name || null,
    supplierServiceId: row.supplier_service_id,
    supplierServiceName: row.supplier_services?.name || null,
    unit: row.unit,
    quantity,
    unitCost,
    totalCost: fromCents(multiplyMoneyToCents(quantity, unitCost)),
    currency: row.currency,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadPackage(orgId: string, packageId: string) {
  const { data, error } = await supabaseAdmin
    .from('packages')
    .select('id, org_id, currency')
    .eq('id', packageId)
    .eq('org_id', orgId)
    .single();

  return { packageData: data as any, error };
}

async function loadSupplierService(orgId: string, supplierServiceId: string) {
  const { data, error } = await supabaseAdmin
    .from('supplier_services')
    .select('id, org_id, supplier_id, name, category, unit, net_price, currency, active, suppliers!supplier_services_supplier_org_fk(id, name)')
    .eq('id', supplierServiceId)
    .eq('org_id', orgId)
    .single();

  return { supplierService: data as any, error };
}

async function loadCostItem(orgId: string, packageId: string, itemId: string) {
  const { data, error } = await supabaseAdmin
    .from('package_cost_items')
    .select('id, package_id, supplier_id, supplier_service_id, currency')
    .eq('id', itemId)
    .eq('package_id', packageId)
    .eq('org_id', orgId)
    .single();

  return { costItem: data as any, error };
}

async function validateSupplier(orgId: string, supplierId: string) {
  const { data, error } = await supabaseAdmin
    .from('suppliers')
    .select('id')
    .eq('id', supplierId)
    .eq('org_id', orgId)
    .single();
  return { supplier: data, error };
}

async function buildCostItemWrite(
  orgId: string,
  packageCurrency: string,
  body: z.infer<typeof costItemSchema>,
  existing?: { supplier_id?: string | null; supplier_service_id?: string | null; currency?: string | null },
) {
  let supplierId = body.supplierId ?? existing?.supplier_id ?? null;
  const effectiveSupplierServiceId = body.supplierServiceId === undefined ? existing?.supplier_service_id ?? null : body.supplierServiceId;
  const write: Record<string, unknown> = {};

  if (body.supplierServiceId) {
    const { supplierService, error } = await loadSupplierService(orgId, body.supplierServiceId);
    if (error || !supplierService) return { status: 404, body: { code: 'SUPPLIER_SERVICE_NOT_FOUND', message: 'Supplier service not found' } };
    if (supplierService.active !== true) return { status: 400, body: { code: 'SUPPLIER_SERVICE_INACTIVE', message: 'Supplier service is inactive' } };
    if (supplierService.currency !== packageCurrency) return { status: 400, body: { code: 'CURRENCY_MISMATCH', message: 'Supplier service currency must match package currency' } };

    supplierId = supplierService.supplier_id;
    write.supplier_service_id = supplierService.id;
    write.supplier_id = supplierService.supplier_id;
    if (!body.category) write.category = serviceCategoryToCostCategory(supplierService.category);
    if (!body.label) write.label = supplierService.name;
    if (!body.unit) write.unit = supplierService.unit;
    if (body.unitCost === undefined) write.unit_cost = supplierService.net_price;
    if (!body.currency) write.currency = supplierService.currency;
  } else if (body.supplierServiceId === null) {
    write.supplier_service_id = null;
  }

  if (effectiveSupplierServiceId && body.supplierServiceId === undefined && body.supplierId !== undefined && body.supplierId !== existing?.supplier_id) {
    return {
      status: 400,
      body: {
        code: 'SUPPLIER_SERVICE_SUPPLIER_MISMATCH',
        message: 'Clear supplier service before changing supplier manually',
      },
    };
  }

  if (supplierId) {
    const { supplier, error } = await validateSupplier(orgId, supplierId);
    if (error || !supplier) return { status: 404, body: { code: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found' } };
    write.supplier_id = supplierId;
  } else if (body.supplierId === null) {
    write.supplier_id = null;
  }

  if (body.category) write.category = body.category;
  if (body.label) write.label = body.label;
  if (body.unit) write.unit = body.unit;
  if (body.quantity !== undefined) write.quantity = body.quantity;
  if (body.unitCost !== undefined) write.unit_cost = body.unitCost;
  if (body.currency) write.currency = body.currency;
  if (body.notes !== undefined) write.notes = body.notes || null;

  const finalCurrency = String(write.currency || body.currency || existing?.currency || packageCurrency);
  if (finalCurrency !== packageCurrency) return { status: 400, body: { code: 'CURRENCY_MISMATCH', message: 'Cost item currency must match package currency' } };

  return { status: 200, write };
}

async function loadCosting(orgId: string, packageId: string) {
  const { packageData, error: packageError } = await loadPackage(orgId, packageId);
  if (packageError || !packageData) {
    return { status: 404, body: { code: 'NOT_FOUND', message: 'Package not found' } };
  }

  const { data: costItems, error: costItemsError } = await supabaseAdmin
    .from('package_cost_items')
    .select('id, package_id, category, label, supplier_id, supplier_service_id, unit, quantity, unit_cost, currency, notes, created_at, updated_at, suppliers!package_cost_items_supplier_org_fk(id, name), supplier_services!package_cost_items_supplier_service_org_fk(id, name, suppliers!supplier_services_supplier_org_fk(id, name))')
    .eq('package_id', packageId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  if (costItemsError) return { status: 500, body: { code: 'DATABASE_ERROR', message: 'Failed to load package cost items' } };

  const finance = derivePackageCosting({
    costItems: costItems || [],
    currency: packageData.currency || 'BAM',
  });

  return {
    status: 200,
    body: {
      packageId,
      currency: packageData.currency || 'BAM',
      totalCost: finance.totalCost,
      costItems: (costItems || []).map(transformCostItem),
      categoryBreakdown: finance.categoryBreakdown,
      warnings: finance.warnings,
    },
  };
}

router.get('/packages/:packageId/costing', authenticateToken, requireOrgContext, requireMinimumRole('manager'), async (req, res: Response) => {
  const parsedId = idSchema.safeParse(req.params.packageId);
  if (!parsedId.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid package ID');

  const result = await loadCosting(req.orgId!, parsedId.data);
  return res.status(result.status).json(result.body);
});

router.post('/packages/:packageId/cost-items', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditLog('CREATE', 'package_cost_item'), async (req, res: Response) => {
  const parsedId = idSchema.safeParse(req.params.packageId);
  const parsedBody = createCostItemSchema.safeParse(req.body);
  if (!parsedId.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid package ID');
  if (!parsedBody.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid cost item', parsedBody.error.issues);

  const orgId = req.orgId!;
  const packageId = parsedId.data;
  const { packageData, error: packageError } = await loadPackage(orgId, packageId);
  if (packageError || !packageData) return apiError(res, 404, 'NOT_FOUND', 'Package not found');

  const built = await buildCostItemWrite(orgId, packageData.currency || 'BAM', parsedBody.data);
  if (built.status !== 200) return res.status(built.status).json(built.body);

  const { data, error } = await supabaseAdmin
    .from('package_cost_items')
    .insert({
      org_id: orgId,
      package_id: packageId,
      ...built.write,
    })
    .select('id, package_id, category, label, supplier_id, supplier_service_id, unit, quantity, unit_cost, currency, notes, created_at, updated_at, suppliers!package_cost_items_supplier_org_fk(id, name), supplier_services!package_cost_items_supplier_service_org_fk(id, name, suppliers!supplier_services_supplier_org_fk(id, name))')
    .single();

  if (error) return handleSupabaseError(res, error, 'Failed to create package cost item');
  return res.status(201).json({ costItem: transformCostItem(data) });
});

router.patch('/packages/:packageId/cost-items/:itemId', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditLog('UPDATE', 'package_cost_item', (req) => req.params.itemId), async (req, res: Response) => {
  const parsedPackageId = idSchema.safeParse(req.params.packageId);
  const parsedItemId = idSchema.safeParse(req.params.itemId);
  const parsedBody = costItemSchema.safeParse(req.body);
  if (!parsedPackageId.success || !parsedItemId.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid ID');
  if (!parsedBody.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid cost item', parsedBody.error.issues);

  const orgId = req.orgId!;
  const { packageData, error: packageError } = await loadPackage(orgId, parsedPackageId.data);
  if (packageError || !packageData) return apiError(res, 404, 'NOT_FOUND', 'Package not found');

  const { costItem: existingCostItem, error: costItemError } = await loadCostItem(orgId, parsedPackageId.data, parsedItemId.data);
  if (costItemError || !existingCostItem) return apiError(res, 404, 'NOT_FOUND', 'Package cost item not found');

  const built = await buildCostItemWrite(orgId, packageData.currency || 'BAM', parsedBody.data, existingCostItem);
  if (built.status !== 200) return res.status(built.status).json(built.body);

  const { data, error } = await supabaseAdmin
    .from('package_cost_items')
    .update(built.write)
    .eq('id', parsedItemId.data)
    .eq('package_id', parsedPackageId.data)
    .eq('org_id', orgId)
    .select('id, package_id, category, label, supplier_id, supplier_service_id, unit, quantity, unit_cost, currency, notes, created_at, updated_at, suppliers!package_cost_items_supplier_org_fk(id, name), supplier_services!package_cost_items_supplier_service_org_fk(id, name, suppliers!supplier_services_supplier_org_fk(id, name))')
    .single();

  if (error) return handleSupabaseError(res, error, 'Failed to update package cost item');
  return res.json({ costItem: transformCostItem(data) });
});

router.delete('/packages/:packageId/cost-items/:itemId', authenticateToken, requireOrgContext, requireMinimumRole('manager'), auditLog('DELETE', 'package_cost_item', (req) => req.params.itemId), async (req, res: Response) => {
  const parsedPackageId = idSchema.safeParse(req.params.packageId);
  const parsedItemId = idSchema.safeParse(req.params.itemId);
  if (!parsedPackageId.success || !parsedItemId.success) return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid ID');

  const orgId = req.orgId!;
  const { packageData, error: packageError } = await loadPackage(orgId, parsedPackageId.data);
  if (packageError || !packageData) return apiError(res, 404, 'NOT_FOUND', 'Package not found');

  const { error } = await supabaseAdmin
    .from('package_cost_items')
    .delete()
    .eq('id', parsedItemId.data)
    .eq('package_id', parsedPackageId.data)
    .eq('org_id', orgId);

  if (error) return handleSupabaseError(res, error, 'Failed to delete package cost item');
  return res.status(204).send();
});

export default router;
