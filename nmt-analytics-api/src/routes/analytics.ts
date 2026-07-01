import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
// We use a custom composed check or rely on getTenantScope after auth
// But existing requireOrgContext is strict. For now we use authenticateToken and let getTenantScope handle the rest if we want flexibility,
// OR we keep requireOrgContext and accept it enforces org_id.
// The user requirement says "if super_admin => no org filter". Existing requireOrgContext breaks this if super_admin has no org.
// To satisfy the requirement "Add a helper... if super_admin => no org filter", we should probably relaxed the middleware or just use authenticateToken + helper.
// I will use authenticateToken and then manual scope check to fully support the requirement.
import { getTenantScope } from '../analytics/scope';
import { AnalyticsQuerySchema, sendAnalyticsResponse } from '../analytics/utils';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { z } from 'zod';

const router = Router();

import { schema } from '../analytics/schema';

type DashboardStats = {
  revenue: number;
  bookings_count: number;
  average_booking_value: number;
  revenue_by_month: { month: string; amount: number }[];
  bookings_by_month: { month: string; count: number }[];
  top_packages: { name: string; revenue: number; bookings: number }[];
};

function normalizeDashboardDateRange(from: unknown, to: unknown) {
  let dateTo = to ? new Date(String(to)) : new Date();
  let dateFrom = from ? new Date(String(from)) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  if (isNaN(dateFrom.getTime())) dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  if (isNaN(dateTo.getTime())) dateTo = new Date();

  dateFrom.setUTCHours(0, 0, 0, 0);
  dateTo.setUTCHours(23, 59, 59, 999);

  return { dateFrom, dateTo };
}

async function calculateDashboardStats(orgId: string, dateFrom: Date, dateTo: Date): Promise<DashboardStats> {
  const { data: reservations, error } = await supabaseAdmin
    .from('reservations')
    .select(`
      id,
      total_amount,
      paid_amount,
      status,
      reservation_at,
      departures (
        id,
        packages (id, name, destination)
      )
    `)
    .eq('org_id', orgId)
    .gte('reservation_at', dateFrom.toISOString())
    .lte('reservation_at', dateTo.toISOString());

  if (error) throw error;

  const rows = (reservations || []) as any[];
  const validRows = rows.filter((r) => r.status !== 'cancelled');
  const confirmedRevenueRows = validRows.filter((r) => ['confirmed', 'completed'].includes(r.status));

  const revenue = confirmedRevenueRows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
  const bookingsCount = validRows.length;

  const revenueByMonthMap = new Map<string, number>();
  const bookingsByMonthMap = new Map<string, number>();
  const topPackageMap = new Map<string, { name: string; revenue: number; bookings: number }>();

  for (const reservation of confirmedRevenueRows) {
    const month = new Date(reservation.reservation_at).toISOString().slice(0, 7);
    const amount = Number(reservation.total_amount || 0);
    revenueByMonthMap.set(month, (revenueByMonthMap.get(month) || 0) + amount);
  }

  for (const reservation of validRows) {
    const month = new Date(reservation.reservation_at).toISOString().slice(0, 7);
    bookingsByMonthMap.set(month, (bookingsByMonthMap.get(month) || 0) + 1);

    const packageName = reservation.departures?.packages?.name || 'Unknown Package';
    const amount = Number(reservation.total_amount || 0);
    const existing = topPackageMap.get(packageName) || { name: packageName, revenue: 0, bookings: 0 };
    existing.revenue += amount;
    existing.bookings += 1;
    topPackageMap.set(packageName, existing);
  }

  return {
    revenue: Number(revenue.toFixed(2)),
    bookings_count: bookingsCount,
    average_booking_value: bookingsCount > 0 ? Number((revenue / bookingsCount).toFixed(2)) : 0,
    revenue_by_month: Array.from(revenueByMonthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount: Number(amount.toFixed(2)) })),
    bookings_by_month: Array.from(bookingsByMonthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count })),
    top_packages: Array.from(topPackageMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((pkg) => ({ ...pkg, revenue: Number(pkg.revenue.toFixed(2)) })),
  };
}

/**
 * GET /api/analytics/overview
 * Returns analytics overview using standardized foundation and schema mapping.
 */
router.get('/analytics/overview', authenticateToken, requireOrgContext, async (req, res: Response, next) => {
  try {
    const { from, to, granularity } = req.query;

    const dateFrom = from
      ? new Date(from as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const dateTo = to ? new Date(to as string) : new Date();

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return apiError(res, 400, "INVALID_DATE_RANGE", "Invalid date range");
    }

    // normalize granularity for PostgreSQL
    const pgGranularity =
      granularity === "daily" || granularity === "day"
        ? "day"
        : granularity === "weekly" || granularity === "week"
          ? "week"
          : granularity === "monthly" || granularity === "month"
            ? "month"
            : "day";

    // orgId is now set by authenticateToken + requireOrgContext middleware
    const orgId = req.orgId!;

    const currentFrom = dateFrom;
    const currentTo = dateTo;
    const format = (d: Date) => d.toISOString();
    currentTo.setUTCHours(23, 59, 59, 999);
    currentFrom.setUTCHours(0, 0, 0, 0);

    // 1. Revenue Query (payments)
    const { data: revenueData, error: revError } = await supabaseAdmin
      .from(schema.revenue.table)
      .select(schema.revenue.amount)
      .eq(schema.revenue.orgId, orgId)
      .in(schema.revenue.status, schema.revenue.filters.paid)
      .gte(schema.revenue.createdAt, format(currentFrom))
      .lte(schema.revenue.createdAt, format(currentTo));

    if (revError) throw revError;

    // 2. Bookings Query (Valid)
    const { data: bookData, error: bookError } = await supabaseAdmin
      .from(schema.bookings.table)
      .select(schema.bookings.status)
      .eq(schema.bookings.orgId, orgId)
      .in(schema.bookings.status, schema.bookings.filters.valid)
      .gte(schema.bookings.date, format(currentFrom))
      .lte(schema.bookings.date, format(currentTo));

    if (bookError) throw bookError;

    // 3. Customers Query
    const { count: customersCount, error: custError } = await supabaseAdmin
      .from(schema.customers.table)
      .select(schema.customers.id, { count: 'exact', head: true })
      .eq(schema.customers.orgId, orgId);

    if (custError) throw custError;

    // 4. All Bookings for Cancellation Rate Calculation
    const { data: allBookingsData, error: allBookError } = await supabaseAdmin
      .from(schema.bookings.table)
      .select(schema.bookings.status)
      .eq(schema.bookings.orgId, orgId)
      .gte(schema.bookings.date, format(currentFrom))
      .lte(schema.bookings.date, format(currentTo));

    if (allBookError) throw allBookError;

    const totalRevenue = (revenueData || []).reduce((sum, r: any) => sum + Number(r[schema.revenue.amount] || 0), 0);
    const totalBookings = bookData?.length || 0;
    const totalCustomers = customersCount || 0;

    const allBookings = allBookingsData || [];
    const cancelledCount = allBookings.filter((b: any) => b.status === 'cancelled').length;
    const validCount = allBookings.filter((b: any) => schema.bookings.filters.valid.includes(b.status)).length;
    const cancellationRate = (validCount + cancelledCount) > 0
      ? Number(((cancelledCount / (validCount + cancelledCount)) * 100).toFixed(2))
      : 0;

    return res.json({
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalBookings: Number(totalBookings),
      totalCustomers: Number(totalCustomers),
      cancellationRate: Number(cancellationRate)
    });

  } catch (error) {
    console.error('ANALYTICS ERROR (Overview):', error);
    const statusCode = (error as any).status === 403 ? 403 : 500;
    return apiError(res, statusCode, statusCode === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR', statusCode === 403 ? 'Forbidden' : 'Internal server error', error instanceof Error ? error.message : String(error));
  }
});

/**
 * GET /api/analytics/trends
 * Returns time series data using standardized foundation.
 */
router.get('/analytics/trends', authenticateToken, requireOrgContext, async (req, res: Response, next) => {
  try {
    const validationResult = AnalyticsQuerySchema.safeParse(req.query);

    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Validation error", validationResult.error.issues);
    }

    const { from, to, granularity } = validationResult.data;
    // orgId is now set by authenticateToken + requireOrgContext middleware
    const orgId = req.orgId!;

    const endDate = to ? new Date(`${to}T23:59:59Z`) : new Date();
    const startDate = from ? new Date(`${from}T00:00:00Z`) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Generate Dates
    const dateSeries: string[] = [];
    const currentDate = new Date(startDate);

    // Safety break for infinite loops with max iterations
    let loops = 0;
    while (currentDate <= endDate && loops < 1000) {
      if (granularity === 'week') {
        const dayOfWeek = currentDate.getDay();
        const monday = new Date(currentDate);
        monday.setDate(currentDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        const mondayStr = monday.toISOString().split('T')[0];
        if (dateSeries.length === 0 || dateSeries[dateSeries.length - 1] !== mondayStr) {
          dateSeries.push(mondayStr);
        }
        currentDate.setDate(currentDate.getDate() + 7);
      } else if (granularity === 'month') {
        const monthStr = currentDate.toISOString().slice(0, 7) + '-01';
        if (dateSeries.length === 0 || dateSeries[dateSeries.length - 1] !== monthStr) {
          dateSeries.push(monthStr);
        }
        currentDate.setMonth(currentDate.getMonth() + 1);
      } else {
        dateSeries.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      loops++;
    }

    // Revenue Query (Standardized to transactions)
    const { data: revData, error: revErr } = await supabaseAdmin
      .from(schema.revenue.table)
      .select(`${schema.revenue.amount}, ${schema.revenue.createdAt}`)
      .eq(schema.revenue.orgId, orgId)
      .in(schema.revenue.status, schema.revenue.filters.paid)
      .gte(schema.revenue.createdAt, startDate.toISOString())
      .lte(schema.revenue.createdAt, endDate.toISOString());

    if (revErr) throw revErr;

    // Bookings Query (Standardized to reservation_at)
    const { data: bookData, error: bookErr } = await supabaseAdmin
      .from(schema.bookings.table)
      .select(`${schema.bookings.status}, ${schema.bookings.date}`)
      .eq(schema.bookings.orgId, orgId)
      .gte(schema.bookings.date, startDate.toISOString())
      .lte(schema.bookings.date, endDate.toISOString());

    if (bookErr) throw bookErr;

    // Helper to group by granularity
    const getGroupKey = (dateStr: string) => {
      const d = new Date(dateStr);
      if (granularity === 'week') {
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        const monday = new Date(d.setDate(diff));
        return monday.toISOString().split('T')[0];
      } else if (granularity === 'month') {
        return d.toISOString().slice(0, 7) + '-01';
      }
      return d.toISOString().split('T')[0];
    };

    const revenueMap = new Map<string, number>();
    (revData || []).forEach((t: any) => {
      const key = getGroupKey(t[schema.revenue.createdAt]);
      revenueMap.set(key, (revenueMap.get(key) || 0) + Number(t[schema.revenue.amount] || 0));
    });

    const bookingsMap = new Map<string, number>();
    const cancellationsMap = new Map<string, number>();
    (bookData || []).forEach((r: any) => {
      const key = getGroupKey(r[schema.bookings.date]);
      bookingsMap.set(key, (bookingsMap.get(key) || 0) + 1);
      if (r[schema.bookings.status] === 'cancelled') {
        cancellationsMap.set(key, (cancellationsMap.get(key) || 0) + 1);
      }
    });

    const revenue = dateSeries.map(date => ({ date, value: Number((revenueMap.get(date) || 0).toFixed(2)) }));
    const bookings = dateSeries.map(date => ({ date, value: bookingsMap.get(date) || 0 }));
    const cancellations = dateSeries.map(date => ({ date, value: cancellationsMap.get(date) || 0 }));

    return sendAnalyticsResponse(res, { revenue, bookings, cancellations }, validationResult.data, { orgId } as any);

  } catch (error) {
    console.error('ANALYTICS ERROR (Trends):', error);
    const statusCode = (error as any).status === 403 ? 403 : 500;
    return apiError(res, statusCode, statusCode === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR', statusCode === 403 ? 'Forbidden' : 'Internal server error', error instanceof Error ? error.message : String(error));
  }
});

/**
 * GET /api/analytics/dashboard
 * Returns dashboard statistics calculated directly from application tables.
 */
router.get('/analytics/dashboard', authenticateToken, requireOrgContext, async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo } = normalizeDashboardDateRange(req.query.from, req.query.to);
    const stats = await calculateDashboardStats(req.orgId!, dateFrom, dateTo);
    return res.json(stats);
  } catch (error) {
    console.error('ANALYTICS ERROR (Dashboard):', error);
    return res.json({ revenue: 0, bookings_count: 0, average_booking_value: 0, revenue_by_month: [], bookings_by_month: [], top_packages: [] });
  }
});

/**
 * GET /api/dashboard
 * Main analytics dashboard endpoint
 */
router.get('/dashboard', authenticateToken, requireOrgContext, async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo } = normalizeDashboardDateRange(req.query.from, req.query.to);
    const stats = await calculateDashboardStats(req.orgId!, dateFrom, dateTo);
    return res.json(stats);
  } catch (error) {
    console.error('ANALYTICS ERROR (Dashboard):', error);
    return res.json({ revenue: 0, bookings_count: 0, average_booking_value: 0, revenue_by_month: [], bookings_by_month: [], top_packages: [] });
  }
});

// ============================================================================
// PHASE 2: ANALYTICS MVP
// ============================================================================

// Validation schema for Phase 2 endpoints
const phase2QuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
});

// DTOs for Phase 2
export interface OverviewAnalyticsV2 {
  // Reservation metrics
  reservations_count: number;
  total_amount_sum: number;
  total_paid_sum: number;
  total_balance_sum: number;

  // Payment status breakdown
  unpaid_count: number;
  partially_paid_count: number;
  paid_count: number;

  // Calculated metrics
  avg_reservation_value: number;

  // Payment metrics
  payments_count: number;
  payments_sum: number;

  // Date range
  date_from: string | null;
  date_to: string | null;
}

export interface PackageAnalyticsV2 {
  package_id: string;
  package_name: string;
  reservations_count: number;
  total_amount_sum: number;
  total_paid_sum: number;
  total_balance_sum: number;
}

/**
 * GET /api/analytics/overview-v2?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 
 * Phase 2: Returns comprehensive analytics overview
 * 
 * Query params:
 * - from (optional): Start date (YYYY-MM-DD) - filters reservations.created_at
 * - to (optional): End date (YYYY-MM-DD) - filters reservations.created_at
 * 
 * Returns:
 * - Reservation counts and totals
 * - Payment status breakdown
 * - Average reservation value
 * - Payment metrics in date range
 */
router.get('/analytics/overview-v2', authenticateToken, requireOrgContext, async (req: Request, res: Response) => {
  const orgId = req.orgId;
  const requestId = (req as any).requestId || 'unknown';

  try {
    console.log(`[GET /api/analytics/overview-v2] [Req:${requestId}] Query:`, req.query);

    // Validate query parameters
    const validationResult = phase2QuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Invalid query parameters", validationResult.error.issues);
    }

    const { from, to } = validationResult.data;

    if (!orgId) {
      return apiError(res, 403, "ORG_REQUIRED", "Organization context required");
    }

    // Build reservation metrics query
    let reservationQuery = supabaseAdmin
      .from('reservations')
      .select('total_amount, paid_amount, balance_due, payment_status')
      .eq('org_id', orgId);

    if (from) reservationQuery = reservationQuery.gte('created_at', from);
    if (to) reservationQuery = reservationQuery.lte('created_at', `${to}T23:59:59.999Z`);

    console.log(`[GET /api/analytics/overview-v2] [Req:${requestId}] Executing reservation metrics query`);
    const { data: reservations, error: reservationError } = await reservationQuery;

    if (reservationError) {
      console.error(`[GET /api/analytics/overview-v2] [Req:${requestId}] Reservation error:`, reservationError);
      return apiError(res, 500, "QUERY_ERROR", "Failed to fetch reservation metrics", reservationError.message);
    }

    // Calculate reservation metrics
    const metrics = {
      reservations_count: reservations?.length || 0,
      total_amount_sum: reservations?.reduce((sum, r) => sum + Number(r.total_amount || 0), 0) || 0,
      total_paid_sum: reservations?.reduce((sum, r) => sum + Number(r.paid_amount || 0), 0) || 0,
      total_balance_sum: reservations?.reduce((sum, r) => sum + Number(r.balance_due || 0), 0) || 0,
      unpaid_count: reservations?.filter(r => r.payment_status === 'unpaid').length || 0,
      partially_paid_count: reservations?.filter(r => r.payment_status === 'partially_paid').length || 0,
      paid_count: reservations?.filter(r => r.payment_status === 'paid').length || 0,
    };

    // Build payment metrics query
    // Use payment_date if available, otherwise fall back to created_at
    let paymentQuery = supabaseAdmin
      .from('payments')
      .select('amount, payment_date, created_at')
      .eq('org_id', orgId)
      .eq('status', 'succeeded');

    // Note: We need to filter by payment_date OR created_at in application code
    // since we can't do COALESCE in Supabase query builder
    const { data: payments, error: paymentError } = await paymentQuery;

    if (paymentError) {
      console.error(`[GET /api/analytics/overview-v2] [Req:${requestId}] Payment error:`, paymentError);
      // Continue without payment metrics
    }

    // Filter payments by date range (using payment_date or created_at)
    const filteredPayments = payments?.filter(p => {
      const paymentDate = p.payment_date || p.created_at?.split('T')[0];
      if (!paymentDate) return false;
      if (from && paymentDate < from) return false;
      if (to && paymentDate > to) return false;
      return true;
    }) || [];

    const paymentMetrics = {
      payments_count: filteredPayments.length,
      payments_sum: filteredPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0),
    };

    const response: OverviewAnalyticsV2 = {
      ...metrics,
      avg_reservation_value: metrics.reservations_count > 0
        ? metrics.total_amount_sum / metrics.reservations_count
        : 0,
      ...paymentMetrics,
      date_from: from || null,
      date_to: to || null,
    };

    console.log(`[GET /api/analytics/overview-v2] [Req:${requestId}] Success:`, response);
    return res.status(200).json(response);

  } catch (error) {
    console.error(`[GET /api/analytics/overview-v2] [Req:${requestId}] Error:`, error);
    return apiError(res, 500, "INTERNAL_ERROR", "Failed to fetch analytics", error instanceof Error ? error.message : String(error));
  }
});

/**
 * GET /api/analytics/by-package?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 
 * Phase 2: Returns analytics grouped by package
 * 
 * Query params:
 * - from (optional): Start date (YYYY-MM-DD) - filters reservations.created_at
 * - to (optional): End date (YYYY-MM-DD) - filters reservations.created_at
 * 
 * Returns array of:
 * - package_id
 * - package_name
 * - reservations_count
 * - total_amount_sum
 * - total_paid_sum
 * - total_balance_sum
 */
router.get('/analytics/by-package', authenticateToken, requireOrgContext, async (req: Request, res: Response) => {
  const orgId = req.orgId;
  const requestId = (req as any).requestId || 'unknown';

  try {
    console.log(`[GET /api/analytics/by-package] [Req:${requestId}] Query:`, req.query);

    // Validate query parameters
    const validationResult = phase2QuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Invalid query parameters", validationResult.error.issues);
    }

    const { from, to } = validationResult.data;

    if (!orgId) {
      return apiError(res, 403, "ORG_REQUIRED", "Organization context required");
    }

    // Build query - get reservations with package info
    let query = supabaseAdmin
      .from('reservations')
      .select(`
                total_amount,
                paid_amount,
                balance_due,
                departures!inner (
                  package_id,
                  packages!inner ( id, name )
                )
            `)
      .eq('org_id', orgId);

    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);

    console.log(`[GET /api/analytics/by-package] [Req:${requestId}] Executing query`);
    const { data: reservations, error } = await query;

    if (error) {
      console.error(`[GET /api/analytics/by-package] [Req:${requestId}] Error:`, error);
      return apiError(res, 500, "QUERY_ERROR", "Failed to fetch package analytics", error.message);
    }

    // Group by package and aggregate
    const packageMap = new Map<string, PackageAnalyticsV2>();

    reservations?.forEach((reservation: any) => {
      const departure = reservation.departures;
      if (!departure?.packages) return;
      const pkg = departure.packages;
      const packageId = pkg.id;
      const packageName = pkg.name || 'Unknown Package';

      if (!packageMap.has(packageId)) {
        packageMap.set(packageId, {
          package_id: packageId,
          package_name: packageName,
          reservations_count: 0,
          total_amount_sum: 0,
          total_paid_sum: 0,
          total_balance_sum: 0,
        });
      }

      const pkgData = packageMap.get(packageId)!;
      pkgData.reservations_count++;
      pkgData.total_amount_sum += Number(reservation.total_amount || 0);
      pkgData.total_paid_sum += Number(reservation.paid_amount || 0);
      pkgData.total_balance_sum += Number(reservation.balance_due || 0);
    });

    const response = Array.from(packageMap.values())
      .sort((a, b) => b.total_amount_sum - a.total_amount_sum); // Sort by revenue desc

    console.log(`[GET /api/analytics/by-package] [Req:${requestId}] Success: ${response.length} packages`);
    return res.status(200).json(response);

  } catch (error) {
    console.error(`[GET /api/analytics/by-package] [Req:${requestId}] Error:`, error);
    return apiError(res, 500, "INTERNAL_ERROR", "Failed to fetch package analytics", error instanceof Error ? error.message : String(error));
  }
});

/**
 * GET /api/analytics/revenue-series?from=YYYY-MM-DD&to=YYYY-MM-DD&bucket=daily|weekly
 * 
 * Returns revenue time series data
 */
router.get('/analytics/revenue-series', authenticateToken, requireOrgContext, async (req: Request, res: Response) => {
  const orgId = req.orgId;
  const requestId = (req as any).requestId || 'unknown';

  try {
    console.log(`[GET /api/analytics/revenue-series] [Req:${requestId}] Query:`, req.query);

    // Validate query parameters
    const querySchema = z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
      bucket: z.enum(['daily', 'weekly']).optional().default('daily'),
    });

    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Invalid query parameters", validationResult.error.issues);
    }

    const { from, to, bucket } = validationResult.data;

    if (!orgId) {
      return apiError(res, 403, "ORG_REQUIRED", "Organization context required");
    }

    // Build reservation revenue query
    let reservationQuery = supabaseAdmin
      .from('reservations')
      .select('created_at, total_amount')
      .eq('org_id', orgId);

    if (from) reservationQuery = reservationQuery.gte('created_at', from);
    if (to) reservationQuery = reservationQuery.lte('created_at', `${to}T23:59:59.999Z`);

    const { data: reservations, error: reservationError } = await reservationQuery;

    if (reservationError) {
      console.error(`[GET /api/analytics/revenue-series] [Req:${requestId}] Reservation error:`, reservationError);
      return apiError(res, 500, "QUERY_ERROR", "Failed to fetch reservation data", reservationError.message);
    }

    // Build payment revenue query
    let paymentQuery = supabaseAdmin
      .from('payments')
      .select('payment_date, created_at, amount')
      .eq('org_id', orgId)
      .eq('status', 'succeeded');

    const { data: payments, error: paymentError } = await paymentQuery;

    if (paymentError) {
      console.error(`[GET /api/analytics/revenue-series] [Req:${requestId}] Payment error:`, paymentError);
    }

    // Group reservations by date bucket
    const reservationMap = new Map<string, number>();
    reservations?.forEach((reservation: any) => {
      const date = new Date(reservation.created_at);
      let bucketKey: string;

      if (bucket === 'weekly') {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        bucketKey = monday.toISOString().split('T')[0];
      } else {
        bucketKey = reservation.created_at.split('T')[0];
      }

      if (from && bucketKey < from) return;
      if (to && bucketKey > to) return;

      reservationMap.set(
        bucketKey,
        (reservationMap.get(bucketKey) || 0) + Number(reservation.total_amount || 0)
      );
    });

    // Group payments by date bucket
    const paymentMap = new Map<string, number>();
    payments?.forEach((payment: any) => {
      const paymentDate = payment.payment_date || payment.created_at?.split('T')[0];
      if (!paymentDate) return;

      const date = new Date(paymentDate);
      let bucketKey: string;

      if (bucket === 'weekly') {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        bucketKey = monday.toISOString().split('T')[0];
      } else {
        bucketKey = paymentDate;
      }

      if (from && bucketKey < from) return;
      if (to && bucketKey > to) return;

      paymentMap.set(
        bucketKey,
        (paymentMap.get(bucketKey) || 0) + Number(payment.amount || 0)
      );
    });

    // Merge data and create time series
    const allDates = new Set([...reservationMap.keys(), ...paymentMap.keys()]);
    const series = Array.from(allDates)
      .sort()
      .map(date => ({
        date,
        total_amount_sum: reservationMap.get(date) || 0,
        total_paid_sum: paymentMap.get(date) || 0,
      }));

    console.log(`[GET /api/analytics/revenue-series] [Req:${requestId}] Success: ${series.length} data points`);
    return res.status(200).json(series);

  } catch (error) {
    console.error(`[GET /api/analytics/revenue-series] [Req:${requestId}] Error:`, error);
    return apiError(res, 500, "INTERNAL_ERROR", "Failed to fetch revenue series", error instanceof Error ? error.message : String(error));
  }
});

// ============================================================================
// CSV EXPORT ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/overview.csv?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 
 * Exports overview analytics as CSV
 */
router.get('/analytics/overview.csv', authenticateToken, requireOrgContext, async (req: Request, res: Response) => {
  const orgId = req.orgId;
  const requestId = (req as any).requestId || 'unknown';

  try {
    console.log(`[GET /api/analytics/overview.csv] [Req:${requestId}] Query:`, req.query);

    const validationResult = phase2QuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Invalid query parameters", validationResult.error.issues);
    }

    const { from, to } = validationResult.data;

    if (!orgId) {
      return apiError(res, 403, "ORG_REQUIRED", "Organization context required");
    }

    // Fetch overview data (reuse logic from overview-v2)
    let reservationQuery = supabaseAdmin
      .from('reservations')
      .select('total_amount, paid_amount, balance_due, payment_status')
      .eq('org_id', orgId);

    if (from) reservationQuery = reservationQuery.gte('reservation_at', from);
    if (to) reservationQuery = reservationQuery.lte('reservation_at', `${to}T23:59:59.999Z`);

    const { data: reservations, error: reservationError } = await reservationQuery;

    if (reservationError) {
      console.error(`[GET /api/analytics/overview.csv] [Req:${requestId}] Error:`, reservationError);
      return apiError(res, 500, "QUERY_ERROR", "Failed to fetch data", reservationError.message);
    }

    const metrics = {
      reservations_count: reservations?.length || 0,
      total_amount_sum: reservations?.reduce((sum, r) => sum + Number(r.total_amount || 0), 0) || 0,
      total_paid_sum: reservations?.reduce((sum, r) => sum + Number(r.paid_amount || 0), 0) || 0,
      total_balance_sum: reservations?.reduce((sum, r) => sum + Number(r.balance_due || 0), 0) || 0,
      unpaid_count: reservations?.filter(r => r.payment_status === 'unpaid').length || 0,
      partially_paid_count: reservations?.filter(r => r.payment_status === 'partially_paid').length || 0,
      paid_count: reservations?.filter(r => r.payment_status === 'paid').length || 0,
    };

    const avg_reservation_value = metrics.reservations_count > 0
      ? metrics.total_amount_sum / metrics.reservations_count
      : 0;

    // Generate CSV
    const csv = [
      // UTF-8 BOM for Excel compatibility
      '\ufeff',
      // Headers
      'Metric,Value',
      `Reservations Count,${metrics.reservations_count}`,
      `Total Amount Sum,${metrics.total_amount_sum.toFixed(2)}`,
      `Total Paid Sum,${metrics.total_paid_sum.toFixed(2)}`,
      `Total Balance Sum,${metrics.total_balance_sum.toFixed(2)}`,
      `Average Reservation Value,${avg_reservation_value.toFixed(2)}`,
      `Unpaid Count,${metrics.unpaid_count}`,
      `Partially Paid Count,${metrics.partially_paid_count}`,
      `Paid Count,${metrics.paid_count}`,
      `Date From,${from || 'All Time'}`,
      `Date To,${to || 'All Time'}`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="overview-${from || 'all'}-to-${to || 'all'}.csv"`);
    return res.send(csv);

  } catch (error) {
    console.error(`[GET /api/analytics/overview.csv] [Req:${requestId}] Error:`, error);
    return apiError(res, 500, "INTERNAL_ERROR", "Failed to export CSV", error instanceof Error ? error.message : String(error));
  }
});

/**
 * GET /api/analytics/by-package.csv?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 
 * Exports package analytics as CSV
 */
router.get('/analytics/by-package.csv', authenticateToken, requireOrgContext, async (req: Request, res: Response) => {
  const orgId = req.orgId;
  const requestId = (req as any).requestId || 'unknown';

  try {
    console.log(`[GET /api/analytics/by-package.csv] [Req:${requestId}] Query:`, req.query);

    const validationResult = phase2QuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return apiError(res, 400, "VALIDATION_ERROR", "Invalid query parameters", validationResult.error.issues);
    }

    const { from, to } = validationResult.data;

    if (!orgId) {
      return apiError(res, 403, "ORG_REQUIRED", "Organization context required");
    }

    // Fetch package data (reuse logic from by-package)
    let query = supabaseAdmin
      .from('reservations')
      .select(`
                total_amount,
                paid_amount,
                balance_due,
                departures!inner (
                  package_id,
                  packages!inner ( id, name )
                )
            `)
      .eq('org_id', orgId);

    if (from) query = query.gte('reservation_at', from);
    if (to) query = query.lte('reservation_at', `${to}T23:59:59.999Z`);

    const { data: reservations, error } = await query;

    if (error) {
      console.error(`[GET /api/analytics/by-package.csv] [Req:${requestId}] Error:`, error);
      return apiError(res, 500, "QUERY_ERROR", "Failed to fetch data", error.message);
    }

    // Group by package
    const packageMap = new Map<string, any>();

    reservations?.forEach((reservation: any) => {
      const departure = reservation.departures;
      if (!departure?.packages) return;
      const pkg = departure.packages;
      const packageId = pkg.id;
      const packageName = pkg.name || 'Unknown Package';

      if (!packageMap.has(packageId)) {
        packageMap.set(packageId, {
          package_name: packageName,
          reservations_count: 0,
          total_amount_sum: 0,
          total_paid_sum: 0,
          total_balance_sum: 0,
        });
      }

      const pkgData = packageMap.get(packageId)!;
      pkgData.reservations_count++;
      pkgData.total_amount_sum += Number(reservation.total_amount || 0);
      pkgData.total_paid_sum += Number(reservation.paid_amount || 0);
      pkgData.total_balance_sum += Number(reservation.balance_due || 0);
    });

    const packages = Array.from(packageMap.values())
      .sort((a, b) => b.total_amount_sum - a.total_amount_sum);

    // Generate CSV
    const csvRows = [
      // UTF-8 BOM for Excel compatibility
      '\ufeff',
      // Headers
      'Package Name,Reservations Count,Total Amount Sum,Total Paid Sum,Total Balance Sum',
      // Data rows
      ...packages.map(pkg =>
        `"${pkg.package_name}",${pkg.reservations_count},${pkg.total_amount_sum.toFixed(2)},${pkg.total_paid_sum.toFixed(2)},${pkg.total_balance_sum.toFixed(2)}`
      )
    ];

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="by-package-${from || 'all'}-to-${to || 'all'}.csv"`);
    return res.send(csv);

  } catch (error) {
    console.error(`[GET /api/analytics/by-package.csv] [Req:${requestId}] Error:`, error);
    return apiError(res, 500, "INTERNAL_ERROR", "Failed to export CSV", error instanceof Error ? error.message : String(error));
  }
});

// ============================================================================
// GET /api/analytics/payment-status
// Returns payment count and amount grouped by status
// ============================================================================
router.get('/analytics/payment-status', authenticateToken, requireOrgContext, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;

    const { data, error } = await supabaseAdmin
      .from('payments')
      .select('status, amount')
      .eq('org_id', orgId);

    if (error) {
      console.error('[analytics/payment-status] Query error:', error);
      return apiError(res, 500, "INTERNAL_ERROR", "Failed to fetch payment status data");
    }

    const payments = data || [];
    const breakdown: Record<string, { count: number; total: number }> = {};

    for (const p of payments) {
      const status = p.status || 'unknown';
      if (!breakdown[status]) breakdown[status] = { count: 0, total: 0 };
      breakdown[status].count += 1;
      breakdown[status].total += Number(p.amount);
    }

    res.json({
      breakdown,
      totalPayments: payments.length,
      totalAmount: payments.reduce((s, p) => s + Number(p.amount), 0),
    });
  } catch (err) {
    console.error('[analytics/payment-status] Error:', err);
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  }
});

export default router;

