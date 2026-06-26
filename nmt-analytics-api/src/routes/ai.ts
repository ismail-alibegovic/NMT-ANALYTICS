import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { apiError } from '../lib/errors';
import { supabaseAdmin } from '../lib/supabase';
import { z } from 'zod';

const router = Router();

const QuerySchema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid format YYYY-MM-DD"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid format YYYY-MM-DD"),
});

type Metrics = {
    revenue: number;
    payment_count: number;
    avg_payment: number;
    failed_count: number;
    pending_count: number;
    refunded_count: number;
    succeeded_count: number;
};

// Helper: Calculate metrics from a list of payments
// Note: We fetch minimal fields (amount, status) to compute this in-memory.
// For large datasets, this should be moved to a Postgres RPC.
async function getMetricsForPeriod(orgId: string, from: Date, to: Date): Promise<Metrics> {
    const { data: payments, error } = await supabaseAdmin
        .from('payments')
        .select('amount, status')
        .eq('org_id', orgId)
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString());

    if (error) {
        console.error('Error fetching payments for AI analysis:', error);
        throw error;
    }

    const initial: Metrics = {
        revenue: 0,
        payment_count: 0,
        avg_payment: 0,
        failed_count: 0,
        pending_count: 0,
        refunded_count: 0,
        succeeded_count: 0
    };

    if (!payments || payments.length === 0) return initial;

    const metrics = payments.reduce((acc, p) => {
        acc.payment_count++;

        switch (p.status) {
            case 'succeeded':
                acc.succeeded_count++;
                acc.revenue += Number(p.amount) || 0;
                break;
            case 'failed':
            case 'cancelled':
                acc.failed_count++;
                break;
            case 'pending':
                acc.pending_count++;
                break;
            case 'refunded':
                acc.refunded_count++;
                break;
        }
        return acc;
    }, initial);

    metrics.avg_payment = metrics.succeeded_count > 0
        ? metrics.revenue / metrics.succeeded_count
        : 0;

    // Round for clean output
    metrics.revenue = Number(metrics.revenue.toFixed(2));
    metrics.avg_payment = Number(metrics.avg_payment.toFixed(2));

    return metrics;
}

router.get('/ai/revenue-down', authenticateToken, requireOrgContext, async (req: Request, res: Response) => {
    try {
        const validation = QuerySchema.safeParse(req.query);

        if (!validation.success) {
            return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', validation.error.format());
        }

        const orgId = req.orgId!; // Guaranteed by requireOrgContext

        const { from, to } = validation.data;

        // 1. Calculate Period Ranges
        const currentFrom = new Date(`${from}T00:00:00.000Z`);
        const currentTo = new Date(`${to}T23:59:59.999Z`);

        // Calculate duration in milliseconds
        const durationMs = currentTo.getTime() - currentFrom.getTime();

        // Period: Previous (shifted back by duration)
        // To match user requirement: "prev_from = from - (to - from)"
        // logic: previous period ends right before current begins? 
        // Usually strict comparison: prev_to = current_from - 1ms
        // But user formula implies strictly subtracting the span.
        // Let's rely on strict time subtraction.
        const prevToMs = currentFrom.getTime() - 1;
        const prevFromMs = prevToMs - durationMs;

        const previousFrom = new Date(prevFromMs);
        const previousTo = new Date(prevToMs);

        // 2. Fetch Data (Parallel)
        const [currentMetrics, prevMetrics] = await Promise.all([
            getMetricsForPeriod(orgId, currentFrom, currentTo),
            getMetricsForPeriod(orgId, previousFrom, previousTo)
        ]);

        // 3. Comparison & Signals
        const revenueChange = currentMetrics.revenue - prevMetrics.revenue;
        const revenueChangePct = prevMetrics.revenue !== 0
            ? (revenueChange / prevMetrics.revenue) * 100
            : (currentMetrics.revenue > 0 ? 100 : 0);

        const signals: any[] = [];

        // Signal: Revenue Drop
        if (revenueChange < 0) {
            signals.push({
                key: 'revenue_drop',
                title: 'Revenue Drop',
                severity: Math.abs(revenueChangePct) > 20 ? 'high' : 'medium',
                explanation: `Revenue is down by ${Math.abs(revenueChangePct).toFixed(1)}% compared to the previous period.`,
                evidence: { current: currentMetrics.revenue, previous: prevMetrics.revenue }
            });
        }

        // Signal: Fewer Successful Payments
        if (currentMetrics.succeeded_count < prevMetrics.succeeded_count) {
            const drop = prevMetrics.succeeded_count - currentMetrics.succeeded_count;
            signals.push({
                key: 'fewer_payments',
                title: 'Fewer Successful Payments',
                severity: drop > 10 ? 'high' : 'medium',
                explanation: `You have ${drop} fewer successful payments than the previous period.`,
                evidence: { current: currentMetrics.succeeded_count, previous: prevMetrics.succeeded_count }
            });
        }

        // Signal: Failed Payments Spike
        if (currentMetrics.failed_count > prevMetrics.failed_count) {
            const increase = currentMetrics.failed_count - prevMetrics.failed_count;
            signals.push({
                key: 'failed_spike',
                title: 'Failed Payments Spike',
                severity: 'high',
                explanation: `Failed payments increased by ${increase}. Check for gateway issues.`,
                evidence: { current: currentMetrics.failed_count, previous: prevMetrics.failed_count }
            });
        }

        // Signal: Refund Spike
        if (currentMetrics.refunded_count > prevMetrics.refunded_count) {
            signals.push({
                key: 'refund_spike',
                title: 'Refund Spike',
                severity: 'medium',
                explanation: `Refunds increased, impacting net revenue.`,
                evidence: { current: currentMetrics.refunded_count, previous: prevMetrics.refunded_count }
            });
        }

        // Signal: Lower Average Order Value
        if (currentMetrics.avg_payment < prevMetrics.avg_payment && currentMetrics.succeeded_count > 0) {
            signals.push({
                key: 'lower_aov',
                title: 'Lower Average Payment',
                severity: 'low',
                explanation: `Average payment amount dropped from ${prevMetrics.avg_payment} to ${currentMetrics.avg_payment}.`,
                evidence: { current: currentMetrics.avg_payment, previous: prevMetrics.avg_payment }
            });
        }

        // 4. Construct Response
        return res.json({
            period: { from: currentFrom.toISOString(), to: currentTo.toISOString() },
            previous: { from: previousFrom.toISOString(), to: previousTo.toISOString() },
            metrics: {
                revenue_current: currentMetrics.revenue,
                revenue_previous: prevMetrics.revenue,
                revenue_change_pct: Number(revenueChangePct.toFixed(1)),

                payment_count_current: currentMetrics.payment_count,
                payment_count_previous: prevMetrics.payment_count,

                avg_payment_current: currentMetrics.avg_payment,
                avg_payment_previous: prevMetrics.avg_payment,

                failed_count_current: currentMetrics.failed_count,
                failed_count_previous: prevMetrics.failed_count,

                pending_count_current: currentMetrics.pending_count,
                pending_count_previous: prevMetrics.pending_count,

                refunded_count_current: currentMetrics.refunded_count,
                refunded_count_previous: prevMetrics.refunded_count
            },
            signals
        });

    } catch (err: any) {
        console.error('AI Revenue Endpoint Error:', err);
        return apiError(res, 500, 'INTERNAL_ERROR', err.message);
    }
});

export default router;
