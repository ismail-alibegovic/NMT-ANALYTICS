import { Router } from 'express';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { auditCustomerCreate, auditCustomerUpdate, auditCustomerDelete, logAuditEntry } from '../middleware/auditLogger';
import { apiError } from "../lib/errors";

const router = Router();

// GET Customers (paginated, searchable)
router.get('/customers', authenticateToken, requireOrgContext, async (req: any, res) => {
  try {
    const orgId = req.orgId;
    const { search, page: pageStr, limit: limitStr, status } = req.query;
    const page = Math.max(1, parseInt(pageStr) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(limitStr) || 50));
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (search) {
      const q = `%${search}%`;
      query = query.or(`full_name.ilike.${q},phone.ilike.${q},email.ilike.${q}`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      data: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (err: any) {
    console.error('GET /customers Error:', err.message);
    apiError(res, 500, "INTERNAL_ERROR", "Failed to fetch customers", err.message);
  }
});

// GET /customers/:id - Single customer
router.get('/customers/:id', authenticateToken, requireOrgContext, async (req: any, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', req.params.id)
      .eq('org_id', req.orgId)
      .single();

    if (error || !data) {
      return apiError(res, 404, "NOT_FOUND", "Customer not found");
    }

    res.json(data);
  } catch (err: any) {
    apiError(res, 500, "INTERNAL_ERROR", "Failed to fetch customer", err.message);
  }
});

// GET /customers/:id/timeline - Activity timeline for a customer
router.get('/customers/:id/timeline', authenticateToken, requireOrgContext, async (req: any, res) => {
  try {
    const orgId = req.orgId;
    const customerId = req.params.id;

    // Fetch audit logs for this customer
    const { data: auditLogs } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .eq('org_id', orgId)
      .eq('entity_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50);

    // Fetch reservations for this customer
    const { data: reservations } = await supabaseAdmin
      .from('reservations')
      .select('id, status, total_amount, paid_amount, created_at, updated_at')
      .eq('org_id', orgId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    // Build combined timeline
    const timeline: any[] = [];

    for (const log of auditLogs || []) {
      timeline.push({
        id: `audit-${log.id}`,
        type: 'audit',
        action: log.action,
        entity: log.entity,
        details: log.details,
        createdAt: log.created_at,
      });
    }

    for (const resv of reservations || []) {
      timeline.push({
        id: `reservation-${resv.id}`,
        type: 'reservation',
        action: 'reservation_created',
        entity: 'reservation',
        details: {
          status: resv.status,
          totalAmount: resv.total_amount,
          paidAmount: resv.paid_amount,
        },
        createdAt: resv.created_at,
      });
    }

    timeline.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(timeline);
  } catch (err: any) {
    apiError(res, 500, "INTERNAL_ERROR", "Failed to fetch timeline", err.message);
  }
});

// CREATE Customer
router.post('/customers', authenticateToken, requireOrgContext, auditCustomerCreate, async (req: any, res) => {
  console.log('[POST /customers] Payload:', req.body);
  try {
    const { full_name, phone, email, status, notes } = req.body;
    const orgId = req.orgId;

    if (!orgId) {
      return apiError(res, 400, "ORG_MISSING", "Organization ID missing");
    }

    if (!full_name) {
      return apiError(res, 400, "VALIDATION_ERROR", "Full name is required");
    }

    // 1. Check duplicate phone (only if provided)
    if (phone) {
      const { data: existing } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('org_id', orgId)
        .eq('phone', phone)
        .maybeSingle();

      if (existing) {
        return apiError(res, 409, "DUPLICATE_ENTRY", "Customer with this phone already exists");
      }
    }

    // 2. Create
    const { data, error } = await supabaseAdmin
      .from('customers')
      .insert({
        org_id: orgId,
        full_name,
        phone,
        email: email || null,
        status: status || 'active',
        notes: notes || null
      })
      .select()
      .single();

    if (error) {
      return handleSupabaseError(res, error, "Failed to create customer");
    }

    console.log('✅ Customer created:', data.id);
    res.status(201).json(data);
  } catch (err: any) {
    console.error('Critical Error:', err);
    apiError(res, 500, "INTERNAL_ERROR", err.message || 'Internal Server Error', String(err));
  }
});

// PATCH Customer (Update)
router.patch('/customers/:id', authenticateToken, requireOrgContext, auditCustomerUpdate, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { full_name, phone, email, status, notes } = req.body;

    const { data, error } = await supabaseAdmin
      .from('customers')
      .update({
        full_name,
        phone,
        email,
        status,
        notes
      })
      .eq('id', id)
      .eq('org_id', req.orgId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    return handleSupabaseError(res, error, "Failed to update customer");
  }
});

// DELETE Customer
router.delete('/customers/:id', authenticateToken, requireOrgContext, auditCustomerDelete, async (req: any, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('customers')
      .delete()
      .eq('id', req.params.id)
      .eq('org_id', req.orgId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    return handleSupabaseError(res, err, "Failed to delete customer");
  }
});

export default router;
