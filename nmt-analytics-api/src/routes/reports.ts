import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from "../middleware/requireRole";
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { z } from 'zod';
import { apiError } from "../lib/errors";
import { generateCSV } from '../utils/csv';

const router = Router();

// All report routes require manager or higher
router.use(authenticateToken, requireOrgContext, requireMinimumRole("manager"));

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
});

/**
 * GET /api/reports/export/transactions.csv
 *
 * Query params: from,to (optional, YYYY-MM-DD format)
 * Returns CSV export of transactions for the user's organization.
 */
router.get('/reports/export/transactions.csv', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Validation error", validationResult.error.issues);
    }

    const { from, to } = validationResult.data;
    const orgId = req.orgId!;

    // Date range logic (inclusive)
    const dateFrom = from ? `${from}T00:00:00Z` : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dateTo = to ? `${to}T23:59:59Z` : new Date().toISOString();

    const { data: transactions, error } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('org_id', orgId)
      .gte('occurred_at', dateFrom)
      .lte('occurred_at', dateTo)
      .order('occurred_at', { ascending: false });

    if (error) return handleSupabaseError(res, error, "Failed to fetch transactions");

    const headers = ['ID', 'Amount', 'Currency', 'Type', 'Note', 'Occurred At', 'Created At'];
    const rows = (transactions || []).map(t => [
      t.id,
      t.amount,
      t.currency,
      t.type,
      t.note || '',
      t.occurred_at,
      t.created_at
    ]);

    const csvContent = generateCSV(headers, rows);
    const filename = `transactions_${from || 'export'}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error in transactions export:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

/**
 * GET /api/reports/export/reservations.csv
 *
 * Query params: from,to (optional, YYYY-MM-DD format)
 * Returns CSV export of reservations for the user's organization.
 */
router.get('/reports/export/reservations.csv', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Validation error", validationResult.error.issues);
    }

    const { from, to } = validationResult.data;
    const orgId = req.orgId!;

    const dateFrom = from ? `${from}T00:00:00Z` : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dateTo = to ? `${to}T23:59:59Z` : new Date().toISOString();

    const { data: reservations, error } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('org_id', orgId)
      .gte('reservation_at', dateFrom)
      .lte('reservation_at', dateTo)
      .order('reservation_at', { ascending: false });

    if (error) return handleSupabaseError(res, error, "Failed to fetch reservations");

    const headers = ['ID', 'Customer Name', 'Customer Phone', 'Party Size', 'Reservation At', 'Status', 'Total Amount', 'Created At'];
    const rows = (reservations || []).map(r => [
      r.id,
      r.customer_name,
      r.customer_phone || '',
      r.party_size,
      r.reservation_at,
      r.status,
      r.total_amount,
      r.created_at
    ]);

    const csvContent = generateCSV(headers, rows);
    const filename = `reservations_${from || 'export'}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error in reservations export:', error);
    apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

/**
 * GET /api/reports/summary
 *
 * Query params: from,to (optional, YYYY-MM-DD format, defaults to last 30 days)
 *
 * Returns summary statistics for the user's organization.
 * Response:
 * {
 *   totalRevenue: number,
 *   totalReservations: number,
 *   totalCustomers: number,
 *   avgOrderValue: number,
 *   topDestinations: []
 * }
 */
router.get('/reports/summary', authenticateToken, requireOrgContext, async (req, res: Response) => {
  const zeroedData = {
    totalRevenue: 0,
    bookedRevenue: 0,
    paidRevenue: 0,
    unpaidRevenue: 0,
    paidPercent: 0,
    totalReservations: 0,
    totalCustomers: 0,
    avgOrderValue: 0,
    topDestinations: [] as any[]
  };

  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(200).json(zeroedData);
    }

    const { from, to } = validationResult.data;
    const orgId = req.orgId!;

    const dateFrom = from ? `${from}T00:00:00Z` : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dateTo = to ? `${to}T23:59:59Z` : new Date().toISOString();

    const [{ data: reservations, error: reservationsError }, { count: customersCount, error: customersError }] = await Promise.all([
      supabaseAdmin
        .from('reservations')
        .select(`
          id,
          total_amount,
          paid_amount,
          balance_due,
          status,
          departure_id,
          departures (
            id,
            packages (id, name, destination)
          )
        `)
        .eq('org_id', orgId)
        .gte('reservation_at', dateFrom)
        .lte('reservation_at', dateTo),
      supabaseAdmin
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
    ]);

    if (reservationsError || customersError) {
      console.error('[API Error] Reports summary query failure:', reservationsError || customersError);
      return res.status(200).json(zeroedData);
    }

    const rows = (reservations || []) as any[];
    const validRows = rows.filter((r) => r.status !== 'cancelled');
    const revenueRows = validRows.filter((r) => ['confirmed', 'completed'].includes(r.status));

    const bookedRevenue = revenueRows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    const paidRevenue = revenueRows.reduce((sum, r) => sum + Number(r.paid_amount || 0), 0);
    const unpaidRevenue = revenueRows.reduce((sum, r) => sum + Number(r.balance_due ?? (Number(r.total_amount || 0) - Number(r.paid_amount || 0))), 0);

    const destinations = new Map<string, { destination: string; revenue: number; reservations: number }>();
    for (const row of revenueRows) {
      const destination = row.departures?.packages?.destination || row.departures?.packages?.name || 'Unknown';
      const existing = destinations.get(destination) || { destination, revenue: 0, reservations: 0 };
      existing.revenue += Number(row.total_amount || 0);
      existing.reservations += 1;
      destinations.set(destination, existing);
    }

    return res.json({
      totalRevenue: Number(bookedRevenue.toFixed(2)),
      bookedRevenue: Number(bookedRevenue.toFixed(2)),
      paidRevenue: Number(paidRevenue.toFixed(2)),
      unpaidRevenue: Number(Math.max(unpaidRevenue, 0).toFixed(2)),
      paidPercent: bookedRevenue > 0 ? Number(((paidRevenue / bookedRevenue) * 100).toFixed(1)) : 0,
      totalReservations: validRows.length,
      totalCustomers: Number(customersCount || 0),
      avgOrderValue: validRows.length > 0 ? Number((bookedRevenue / validRows.length).toFixed(2)) : 0,
      topDestinations: Array.from(destinations.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map((item) => ({ ...item, revenue: Number(item.revenue.toFixed(2)) }))
    });

  } catch (err) {
    console.error('[API Error] Internal error in /reports/summary:', err);
    res.status(200).json(zeroedData);
  }
});

export default router;
