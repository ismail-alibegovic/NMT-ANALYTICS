import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { z } from 'zod';
import { getTenantScope } from '../analytics/scope';
import { AnalyticsQuerySchema, sendAnalyticsResponse } from '../analytics/utils';

const router = Router();

import { schema } from '../analytics/schema';
import { apiError } from "../lib/errors";

// Granularity helper
function generatePeriods(from: string, to: string, granularity: 'day' | 'week' | 'month'): string[] {
  const periods: string[] = [];
  const currentDate = new Date(from);
  const endDate = new Date(to);

  // Set boundaries
  currentDate.setUTCHours(0, 0, 0, 0);
  endDate.setUTCHours(23, 59, 59, 999);

  let loops = 0;
  while (currentDate <= endDate && loops < 2000) {
    let dateStr = '';

    if (granularity === 'week') {
      const day = currentDate.getDay();
      const diff = currentDate.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(currentDate);
      monday.setDate(diff);
      dateStr = monday.toISOString().split('T')[0];
      currentDate.setDate(currentDate.getDate() + 7);
    } else if (granularity === 'month') {
      dateStr = currentDate.toISOString().slice(0, 7) + '-01';
      currentDate.setMonth(currentDate.getMonth() + 1);
    } else {
      dateStr = currentDate.toISOString().split('T')[0];
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (periods.length === 0 || periods[periods.length - 1] !== dateStr) {
      periods.push(dateStr);
    }
    loops++;
  }
  return periods;
}

const seriesSchema = AnalyticsQuerySchema;

/**
 * GET /api/metrics/revenue-series
 * Returns object: { data: [{ date, value }] }
 */
router.get('/metrics/revenue-series', authenticateToken, requireOrgContext, async (req, res: Response) => {
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

    // orgId is now set by authenticateToken middleware
    const orgId = req.orgId;

    if (!orgId) {
      return apiError(res, 403, "FORBIDDEN", "Organization context required");
    }

    const currentFrom = dateFrom.toISOString().slice(0, 10);
    const currentTo = dateTo.toISOString().slice(0, 10);

    // Generate dates
    const periods = generatePeriods(currentFrom, currentTo, pgGranularity as any);

    // Query using schema
    const { data: revenueData, error: dbError } = await supabaseAdmin
      .from(schema.revenue.table)
      .select(`${schema.revenue.amount}, ${schema.revenue.createdAt}`)
      .eq(schema.revenue.orgId, orgId)
      .in(schema.revenue.status, schema.revenue.filters.paid)
      .gte(schema.revenue.createdAt, `${currentFrom}T00:00:00Z`)
      .lte(schema.revenue.createdAt, `${currentTo}T23:59:59Z`);

    if (dbError) throw dbError;

    // Grouping
    const periodMap = new Map<string, number>();
    (revenueData || []).forEach((item: any) => {
      const d = new Date(item[schema.revenue.createdAt]);
      let key = d.toISOString().split('T')[0];

      if (pgGranularity === 'week') {
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d);
        monday.setDate(diff);
        key = monday.toISOString().split('T')[0];
      } else if (pgGranularity === 'month') {
        key = d.toISOString().slice(0, 7) + '-01';
      }

      const val = Number(item[schema.revenue.amount] || 0);
      periodMap.set(key, (periodMap.get(key) || 0) + val);
    });

    const series = periods.map(date => ({
      date,
      value: Number((periodMap.get(date) || 0).toFixed(2))
    }));

    return res.json({ data: series });

  } catch (error) {
    console.error('ANALYTICS ERROR (Revenue Series):', error);
    const statusCode = (error as any).status === 403 ? 403 : 500;
    return apiError(res, statusCode, statusCode === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR', statusCode === 403 ? 'Forbidden' : 'Internal server error', error instanceof Error ? error.message : String(error));
  }
});

/**
 * GET /api/metrics/bookings-series
 * Returns object: { data: [{ date, value }] }
 */
router.get('/metrics/bookings-series', authenticateToken, requireOrgContext, async (req, res: Response) => {
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

    // orgId is now set by authenticateToken middleware
    const orgId = req.orgId;

    if (!orgId) {
      return apiError(res, 403, "FORBIDDEN", "Organization context required");
    }

    const currentFrom = dateFrom.toISOString().slice(0, 10);
    const currentTo = dateTo.toISOString().slice(0, 10);

    // Generate dates
    const periods = generatePeriods(currentFrom, currentTo, pgGranularity as any);

    // Query using schema
    const { data: bookingsData, error: dbError } = await supabaseAdmin
      .from(schema.bookings.table)
      .select(`${schema.bookings.status}, ${schema.bookings.date}`)
      .eq(schema.bookings.orgId, orgId)
      .in(schema.bookings.status, schema.bookings.filters.valid)
      .gte(schema.bookings.date, `${currentFrom}T00:00:00Z`)
      .lte(schema.bookings.date, `${currentTo}T23:59:59Z`);

    if (dbError) throw dbError;

    // Grouping
    const periodMap = new Map<string, number>();
    (bookingsData || []).forEach((item: any) => {
      const d = new Date(item[schema.bookings.date]);
      let key = d.toISOString().split('T')[0];

      if (pgGranularity === 'week') {
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d);
        monday.setDate(diff);
        key = monday.toISOString().split('T')[0];
      } else if (pgGranularity === 'month') {
        key = d.toISOString().slice(0, 7) + '-01';
      }

      periodMap.set(key, (periodMap.get(key) || 0) + 1);
    });

    const series = periods.map(date => ({
      date,
      value: periodMap.get(date) || 0
    }));

    return res.json({ data: series });

  } catch (error) {
    console.error('ANALYTICS ERROR (Bookings Series):', error);
    const statusCode = (error as any).status === 403 ? 403 : 500;
    return apiError(res, statusCode, statusCode === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR', statusCode === 403 ? 'Forbidden' : 'Internal server error', error instanceof Error ? error.message : String(error));
  }
});

export default router;
