/**
 * EXAMPLE: Refactored Analytics Route
 * 
 * This file demonstrates how to update an analytics endpoint to use
 * the payments table as the single source of truth for revenue.
 * 
 * BEFORE: Mixed revenue sources (reservations + transactions)
 * AFTER: Single source of truth (transactions only)
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

// ============================================================================
// EXAMPLE 1: Simple Revenue Total
// ============================================================================

/**
 * GET /api/analytics/revenue/total
 * Returns total revenue for the organization
 */
router.get('/analytics/revenue/total', authenticateToken, requireOrgContext, async (req: Request, res: Response) => {
    try {
        const { from, to } = req.query;
        const orgId = req.orgId!;

        // Default to last 30 days
        const endDate = to ? new Date(to as string) : new Date();
        const startDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // ❌ OLD WAY: Using reservations
        // const { data, error } = await supabaseAdmin
        //   .from('reservations')
        //   .select('total_amount')
        //   .eq('org_id', orgId)
        //   .in('status', ['confirmed', 'completed']);

        // ✅ NEW WAY: Using payments (single source of truth)
        const { data, error } = await supabaseAdmin
            .from('transactions')
            .select('amount')
            .eq('org_id', orgId)
            .eq('type', 'payment')
            .eq('status', 'succeeded')
            .gte('occurred_at', startDate.toISOString())
            .lte('occurred_at', endDate.toISOString());

        if (error) throw error;

        const totalRevenue = (data || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);

        return res.json({
            totalRevenue: Number(totalRevenue.toFixed(2)),
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        });

    } catch (error) {
        console.error('Revenue total error:', error);
        return res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : String(error)
        });
    }
});

// ============================================================================
// EXAMPLE 2: Revenue with Breakdown
// ============================================================================

/**
 * GET /api/analytics/revenue/summary
 * Returns revenue summary with paid/unpaid breakdown
 */
router.get('/analytics/revenue/summary', authenticateToken, requireOrgContext, async (req: Request, res: Response) => {
    try {
        const { from, to } = req.query;
        const orgId = req.orgId!;

        const endDate = to ? new Date(to as string) : new Date();
        const startDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // ✅ Get actual revenue from payments
        const { data: paymentData, error: paymentError } = await supabaseAdmin
            .from('transactions')
            .select('amount')
            .eq('org_id', orgId)
            .eq('type', 'payment')
            .eq('status', 'succeeded')
            .gte('occurred_at', startDate.toISOString())
            .lte('occurred_at', endDate.toISOString());

        if (paymentError) throw paymentError;

        const paidRevenue = (paymentData || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);

        // Get booking context (for unpaid calculation only)
        const { data: bookingData, error: bookingError } = await supabaseAdmin
            .from('reservations')
            .select('total_amount')
            .eq('org_id', orgId)
            .in('status', ['confirmed', 'completed'])
            .gte('reservation_at', startDate.toISOString())
            .lte('reservation_at', endDate.toISOString());

        if (bookingError) throw bookingError;

        const bookedAmount = (bookingData || []).reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
        const unpaidAmount = Math.max(bookedAmount - paidRevenue, 0);
        const paidPercent = bookedAmount > 0 ? (paidRevenue / bookedAmount) * 100 : 0;

        return res.json({
            // Primary metrics (from payments)
            totalRevenue: Number(paidRevenue.toFixed(2)),
            paidRevenue: Number(paidRevenue.toFixed(2)),

            // Context metrics (from bookings)
            bookedAmount: Number(bookedAmount.toFixed(2)),
            unpaidAmount: Number(unpaidAmount.toFixed(2)),
            paidPercent: Number(paidPercent.toFixed(2)),

            // Metadata
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        });

    } catch (error) {
        console.error('Revenue summary error:', error);
        return res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : String(error)
        });
    }
});

// ============================================================================
// EXAMPLE 3: Revenue by Day (Time Series)
// ============================================================================

/**
 * GET /api/analytics/revenue/by-day
 * Returns daily revenue breakdown for charts
 */
router.get('/analytics/revenue/by-day', authenticateToken, requireOrgContext, async (req: Request, res: Response) => {
    try {
        const { from, to } = req.query;
        const orgId = req.orgId!;

        const endDate = to ? new Date(to as string) : new Date();
        const startDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // ✅ Use RPC function for better performance
        const { data, error } = await supabaseAdmin.rpc('get_revenue_by_day', {
            p_org_id: orgId,
            p_start_date: startDate.toISOString(),
            p_end_date: endDate.toISOString()
        });

        if (error) {
            // Fallback to direct query if RPC not available
            const { data: fallbackData, error: fallbackError } = await supabaseAdmin
                .from('transactions')
                .select('amount, occurred_at')
                .eq('org_id', orgId)
                .eq('type', 'payment')
                .eq('status', 'succeeded')
                .gte('occurred_at', startDate.toISOString())
                .lte('occurred_at', endDate.toISOString());

            if (fallbackError) throw fallbackError;

            // Group by day
            const dailyMap = new Map<string, { revenue: number; count: number }>();
            (fallbackData || []).forEach(t => {
                const date = new Date(t.occurred_at).toISOString().split('T')[0];
                const current = dailyMap.get(date) || { revenue: 0, count: 0 };
                dailyMap.set(date, {
                    revenue: current.revenue + Number(t.amount || 0),
                    count: current.count + 1
                });
            });

            const result = Array.from(dailyMap.entries()).map(([date, data]) => ({
                date,
                revenue: Number(data.revenue.toFixed(2)),
                paymentCount: data.count
            })).sort((a, b) => a.date.localeCompare(b.date));

            return res.json(result);
        }

        return res.json(data);

    } catch (error) {
        console.error('Revenue by day error:', error);
        return res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : String(error)
        });
    }
});

// ============================================================================
// EXAMPLE 4: Revenue by Package
// ============================================================================

/**
 * GET /api/analytics/revenue/by-package
 * Returns revenue breakdown by package
 */
router.get('/analytics/revenue/by-package', authenticateToken, requireOrgContext, async (req: Request, res: Response) => {
    try {
        const { from, to, limit = '10' } = req.query;
        const orgId = req.orgId!;

        const endDate = to ? new Date(to as string) : new Date();
        const startDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // ✅ Join payments to packages via reservations
        const { data, error } = await supabaseAdmin
            .from('transactions')
            .select(`
        amount,
        reservations!inner (
          departures!inner (
            packages!inner (
              id,
              name,
              destination
            )
          )
        )
      `)
            .eq('org_id', orgId)
            .eq('type', 'payment')
            .eq('status', 'succeeded')
            .gte('occurred_at', startDate.toISOString())
            .lte('occurred_at', endDate.toISOString());

        if (error) throw error;

        // Aggregate by package
        const packageMap = new Map<string, {
            id: string;
            name: string;
            destination: string;
            revenue: number;
            paymentCount: number;
        }>();

        (data || []).forEach((t: any) => {
            const pkg = t.reservations?.departures?.packages;
            if (!pkg) return;

            const current = packageMap.get(pkg.id) || {
                id: pkg.id,
                name: pkg.name,
                destination: pkg.destination,
                revenue: 0,
                paymentCount: 0
            };

            packageMap.set(pkg.id, {
                ...current,
                revenue: current.revenue + Number(t.amount || 0),
                paymentCount: current.paymentCount + 1
            });
        });

        const result = Array.from(packageMap.values())
            .map(p => ({
                ...p,
                revenue: Number(p.revenue.toFixed(2))
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, parseInt(limit as string));

        return res.json(result);

    } catch (error) {
        console.error('Revenue by package error:', error);
        return res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : String(error)
        });
    }
});

// ============================================================================
// EXAMPLE 5: Using the Comprehensive RPC Function
// ============================================================================

/**
 * GET /api/analytics/revenue/comprehensive
 * Returns all revenue analytics using the RPC function
 */
router.get('/analytics/revenue/comprehensive', authenticateToken, requireOrgContext, async (req: Request, res: Response) => {
    try {
        const { from, to } = req.query;
        const orgId = req.orgId!;

        const endDate = to ? new Date(to as string) : new Date();
        const startDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // ✅ Use the comprehensive RPC function
        const { data, error } = await supabaseAdmin.rpc('get_revenue_analytics', {
            p_org_id: orgId,
            p_start_date: startDate.toISOString(),
            p_end_date: endDate.toISOString()
        });

        if (error) throw error;

        // Check for function-level errors
        if (data?.error) {
            throw new Error(data.message || 'RPC function error');
        }

        return res.json(data);

    } catch (error) {
        console.error('Comprehensive revenue error:', error);
        return res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : String(error)
        });
    }
});

// ============================================================================
// MIGRATION NOTES
// ============================================================================

/*
BEFORE (Old Approach):
- Mixed revenue sources (reservations.total_amount + transactions)
- Inconsistent date filtering (reservation_at vs occurred_at)
- No clear distinction between booked and paid revenue
- Difficult to track actual cash flow

AFTER (New Approach):
- Single source of truth: transactions table
- Consistent filtering: type = 'payment', status = 'succeeded'
- Clear separation: paid_revenue (actual) vs booked_amount (expected)
- Accurate cash flow tracking

KEY CHANGES:
1. Always query transactions table for revenue
2. Always filter by type = 'payment' AND status = 'succeeded'
3. Use occurred_at for date filtering (when payment received)
4. Use reservations only for context (unpaid calculation)
5. Always filter by org_id for multi-tenant safety

PERFORMANCE:
- Use RPC functions for complex queries
- Leverage indexes: idx_transactions_analytics
- Consider materialized views for large datasets
- Monitor query performance in production

TESTING:
- Test with no payments (should return 0, not error)
- Test with partial payments (should sum correctly)
- Test with unlinked payments (should include in total)
- Test multi-tenant isolation (org_id filtering)
- Test date ranges (edge cases)
*/

export default router;
