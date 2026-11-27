import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { requireModule } from '../middleware/requireModule';
import { requireAiEntitlement } from '../middleware/requireAiEntitlement';
import { apiError } from '../lib/errors';
import { supabaseAdmin } from '../lib/supabase';
import { buildOrgAiContext } from '../lib/aiContextBuilder';
import { runAuthorizedReadOnlyTools, BUSINESS_TOOL_REGISTRY } from '../lib/aiToolRegistry';
import { executeOrgAiCompletion, parseEncryptedCustomHeaders, type ResolvedAiProvider } from '../lib/aiProviderService';
import { decryptSecret } from '../lib/secretVault';
import { z } from 'zod';

const router = Router();
const MANAGER_ROLES = new Set(['manager', 'director', 'super_admin']);

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

    metrics.revenue = Number(metrics.revenue.toFixed(2));
    metrics.avg_payment = Number(metrics.avg_payment.toFixed(2));

    return metrics;
}

router.get('/ai/revenue-down', authenticateToken, requireOrgContext, requireMinimumRole('manager'), requireModule('analytics'), async (req: Request, res: Response) => {
    try {
        const validation = QuerySchema.safeParse(req.query);

        if (!validation.success) {
            return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', validation.error.format());
        }

        const orgId = req.orgId!;
        const { from, to } = validation.data;

        const currentFrom = new Date(`${from}T00:00:00.000Z`);
        const currentTo = new Date(`${to}T23:59:59.999Z`);
        const durationMs = currentTo.getTime() - currentFrom.getTime();
        const prevToMs = currentFrom.getTime() - 1;
        const prevFromMs = prevToMs - durationMs;
        const previousFrom = new Date(prevFromMs);
        const previousTo = new Date(prevToMs);

        const [currentMetrics, prevMetrics] = await Promise.all([
            getMetricsForPeriod(orgId, currentFrom, currentTo),
            getMetricsForPeriod(orgId, previousFrom, previousTo)
        ]);

        const revenueChange = currentMetrics.revenue - prevMetrics.revenue;
        const revenueChangePct = prevMetrics.revenue !== 0
            ? (revenueChange / prevMetrics.revenue) * 100
            : (currentMetrics.revenue > 0 ? 100 : 0);

        const signals: any[] = [];

        if (revenueChange < 0) {
            signals.push({
                key: 'revenue_drop',
                title: 'Revenue Drop',
                severity: Math.abs(revenueChangePct) > 20 ? 'high' : 'medium',
                explanation: `Revenue is down by ${Math.abs(revenueChangePct).toFixed(1)}% compared to the previous period.`,
                evidence: { current: currentMetrics.revenue, previous: prevMetrics.revenue }
            });
        }

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

        if (currentMetrics.refunded_count > prevMetrics.refunded_count) {
            signals.push({
                key: 'refund_spike',
                title: 'Refund Spike',
                severity: 'medium',
                explanation: `Refunds increased, impacting net revenue.`,
                evidence: { current: currentMetrics.refunded_count, previous: prevMetrics.refunded_count }
            });
        }

        if (currentMetrics.avg_payment < prevMetrics.avg_payment && currentMetrics.succeeded_count > 0) {
            signals.push({
                key: 'lower_aov',
                title: 'Lower Average Payment',
                severity: 'low',
                explanation: `Average payment amount dropped from ${prevMetrics.avg_payment} to ${currentMetrics.avg_payment}.`,
                evidence: { current: currentMetrics.avg_payment, previous: prevMetrics.avg_payment }
            });
        }

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

router.get('/ai/occupancy', authenticateToken, requireOrgContext, requireMinimumRole('manager'), requireModule('analytics'), async (req: Request, res: Response) => {
    try {
        const orgId = req.orgId!;
        const daysAhead = parseInt(req.query.days as string) || 30;
        const now = new Date();
        const horizon = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

        const { data: departures, error } = await supabaseAdmin
            .from('departures')
            .select('id, depart_at, return_at, capacity, booked, status, packages(id, name, destination, base_price)')
            .eq('org_id', orgId)
            .eq('status', 'active')
            .gte('depart_at', now.toISOString().split('T')[0])
            .lte('depart_at', horizon.toISOString().split('T')[0])
            .order('depart_at', { ascending: true });

        if (error) return apiError(res, 500, 'FETCH_FAILED', error.message);

        const predictions = (departures || []).map((dep: any) => {
            const pkg = dep.packages || {};
            const cap = dep.capacity || 1;
            const booked = dep.booked || 0;
            const fillRate = Math.round((booked / cap) * 100);
            const remaining = Math.max(0, cap - booked);
            const daysUntil = Math.max(0, Math.ceil((new Date(dep.depart_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

            let prediction = 'low_demand';
            if (fillRate >= 100) prediction = 'sold_out';
            else if (fillRate >= 70 && daysUntil > 7) prediction = 'likely_sell_out';
            else if (fillRate >= 50) prediction = 'strong_demand';
            else if (fillRate >= 30) prediction = 'moderate_demand';
            else if (daysUntil < 7) prediction = 'low_demand_urgent';

            return {
                departureId: dep.id, packageName: pkg.name || 'Unknown',
                destination: pkg.destination || '', departAt: dep.depart_at,
                capacity: cap, booked, remaining, fillRatePercent: fillRate,
                daysUntilDeparture: daysUntil, prediction,
            };
        });

        const soldOut = predictions.filter(p => p.prediction === 'sold_out').length;
        const likelySellOut = predictions.filter(p => p.prediction === 'likely_sell_out').length;
        const avgFillRate = predictions.length ? Math.round(predictions.reduce((s, p) => s + p.fillRatePercent, 0) / predictions.length) : 0;

        return res.json({
            totalDepartures: departures?.length || 0,
            stats: { soldOut, likelySellOut, avgFillRate },
            predictions,
        });
    } catch (err: any) {
        return apiError(res, 500, 'AI_ERROR', err.message);
    }
});

router.get('/ai/recommend-packages', authenticateToken, requireOrgContext, requireMinimumRole('manager'), requireModule('analytics'), async (req: Request, res: Response) => {
    try {
        const orgId = req.orgId!;
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

        const { data: reservations } = await supabaseAdmin
            .from('reservations')
            .select('party_size, departures!inner(package_id, packages!inner(id, name, destination, base_price))')
            .eq('org_id', orgId)
            .neq('status', 'cancelled')
            .gte('created_at', ninetyDaysAgo);

        const pkgMap = new Map<string, { bookings: number; revenue: number }>();
        for (const r of (reservations || [])) {
            const pkg = (r as any).departures?.packages;
            if (!pkg?.id) continue;
            const key = pkg.id;
            const existing = pkgMap.get(key) || { bookings: 0, revenue: 0 };
            existing.bookings += r.party_size || 1;
            existing.revenue += (pkg.base_price || 0) * (r.party_size || 1);
            pkgMap.set(key, existing);
        }

        const top = [...pkgMap.entries()].map(([id, d]) => ({ id, ...d }))
            .sort((a, b) => b.bookings - a.bookings).slice(0, 5);

        const { data: allP } = await supabaseAdmin
            .from('packages').select('id, name, destination, base_price')
            .eq('org_id', orgId);

        const zero = (allP || []).filter(p => !pkgMap.has(p.id)).slice(0, 5);

        return res.json({
            topPerforming: top,
            underperforming: zero.map(p => ({
                id: p.id, name: p.name, destination: p.destination,
                basePrice: p.base_price,
                reason: 'No bookings in last 90 days',
            })),
        });
    } catch (err: any) {
        return apiError(res, 500, 'AI_ERROR', err.message);
    }
});

const AssistantSchema = z.object({
    question: z.string().trim().min(1).max(2000),
    locale: z.enum(['bs', 'en']).default('bs'),
    providerId: z.string().uuid().optional(),
    modelId: z.string().trim().min(1).max(160).optional(),
    history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
    })).max(10).optional(),
    pageContext: z.object({
        route: z.string().max(200).optional(),
        entityType: z.string().max(60).optional(),
        entityId: z.string().max(80).optional(),
    }).optional(),
});

async function fetchFocusedEntityContext(orgId: string, role: string, pageContext?: { entityType?: string; entityId?: string }) {
    if (!pageContext?.entityType || !pageContext?.entityId) return null;
    const isManagerPlus = MANAGER_ROLES.has((role || '').toLowerCase());
    const id = pageContext.entityId;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

    if (pageContext.entityType === 'departure') {
        const { data } = await supabaseAdmin
            .from('departures')
            .select('id, depart_at, return_at, capacity, booked, status, packages(name, destination)')
            .eq('id', id)
            .eq('org_id', orgId)
            .maybeSingle();
        return data || null;
    }
    if (pageContext.entityType === 'package') {
        const { data } = await supabaseAdmin
            .from('packages')
            .select('id, name, destination, duration_days, base_price, currency, max_participants, is_active')
            .eq('id', id)
            .eq('org_id', orgId)
            .maybeSingle();
        return data || null;
    }
    if (pageContext.entityType === 'customer') {
        const { data } = await supabaseAdmin
            .from('customers')
            .select('id, full_name, phone, email')
            .eq('id', id)
            .eq('org_id', orgId)
            .maybeSingle();
        return data || null;
    }
    if (pageContext.entityType === 'reservation') {
        const cols = isManagerPlus
            ? 'id, customer_name, party_size, status, total_amount, paid_amount, balance_due, currency, departure_id'
            : 'id, customer_name, party_size, status, departure_id';
        const { data } = await supabaseAdmin
            .from('reservations')
            .select(cols)
            .eq('id', id)
            .eq('org_id', orgId)
            .maybeSingle();
        return data || null;
    }
    return null;
}

router.get(
    '/ai/tools',
    authenticateToken,
    requireOrgContext,
    requireMinimumRole('agent'),
    requireAiEntitlement,
    (_req: Request, res: Response) => {
        return res.json({
            tools: BUSINESS_TOOL_REGISTRY.map((t) => ({
                name: t.name,
                description: t.description,
                category: t.category,
                minRole: t.minRole,
                requiresConfirmation: t.requiresConfirmation,
            })),
        });
    },
);

router.post(
    '/ai/assistant',
    authenticateToken,
    requireOrgContext,
    requireMinimumRole('agent'),
    requireAiEntitlement,
    async (req: Request, res: Response) => {
        const parsed = AssistantSchema.safeParse(req.body);
        if (!parsed.success) {
            return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid assistant request', parsed.error.issues);
        }

        const { question, locale, providerId, modelId, history, pageContext } = parsed.data;
        const orgId = req.orgId!;
        const userRole = req.user?.role || 'agent';

        try {
            let overrideProvider: ResolvedAiProvider | undefined;
            if (providerId) {
                const { data: adminRow } = await supabaseAdmin
                    .from('platform_admins')
                    .select('user_id')
                    .eq('user_id', req.user?.id || '')
                    .eq('is_active', true)
                    .maybeSingle();
                if (!adminRow) {
                    return apiError(res, 403, 'PLATFORM_ADMIN_REQUIRED', 'Only platform administrators can override AI provider routing');
                }
                const { data: pRow } = await supabaseAdmin.from('ai_providers').select('*').eq('id', providerId).single();
                if (!pRow) return apiError(res, 404, 'NOT_FOUND', 'Selected AI provider not found');
                overrideProvider = {
                    id: pRow.id,
                    scope: pRow.scope,
                    providerType: pRow.provider_type,
                    protocol: pRow.protocol || 'openai_chat_completions',
                    authMethod: pRow.auth_method || 'bearer',
                    apiKey: decryptSecret(pRow.encrypted_api_key),
                    model: modelId || pRow.default_model,
                    fallbackModel: pRow.fallback_model ?? null,
                    baseUrl: pRow.base_url ?? null,
                    customHeaders: parseEncryptedCustomHeaders(pRow.custom_headers_encrypted),
                    timeoutMs: Number(pRow.request_timeout_ms ?? 30000),
                    maxOutputTokens: Number(pRow.max_output_tokens ?? 2048),
                };
            }

            const [contextSnapshot, toolData, focusedEntity] = await Promise.all([
                buildOrgAiContext(orgId, userRole),
                runAuthorizedReadOnlyTools(orgId, userRole),
                fetchFocusedEntityContext(orgId, userRole, pageContext),
            ]);

            const systemPrompt = [
                'You are Travline AI, a strictly read-only assistant for a travel agency.',
                `Respond in ${locale === 'bs' ? 'Bosnian (bs)' : 'English (en)'}.`,
                'Answer ONLY using the verified organization snapshot and typed tool outputs below.',
                'Be concise and structured (use bullet points or compact markdown lists when listing records).',
                'Cite exact currency codes (BAM, EUR, USD) and never mix incompatible currencies.',
                'Include relative Travline routes (such as /departures/<id>, /packages/<id>, /reservations/<id>, /customers/<id>) when referencing records.',
                'Never invent numbers, customer names, prices, or claim to execute write actions directly.',
                'Never output internal reasoning or <think> tags.',
                pageContext ? `CURRENT_PAGE_CONTEXT: ${JSON.stringify(pageContext)}` : '',
                focusedEntity ? `FOCUSED_ENTITY: ${JSON.stringify(focusedEntity)}` : '',
                `VERIFIED_ORG_SNAPSHOT: ${JSON.stringify(contextSnapshot)}`,
                `VERIFIED_TOOL_DATA: ${JSON.stringify(toolData)}`,
            ].filter(Boolean).join('\n');

            const messages = [
                { role: 'system' as const, content: systemPrompt },
                ...(history || []).map((m) => ({ role: m.role, content: m.content })),
                { role: 'user' as const, content: question },
            ];

            const completion = await executeOrgAiCompletion(
                orgId,
                req.user?.id || null,
                'read_only_assistant',
                {
                    messages,
                    temperature: 0.2,
                    maxTokens: Math.min(4096, Math.max(1536, overrideProvider?.maxOutputTokens || 2048)),
                },
                fetch,
                overrideProvider,
                'chat',
            );

            if (!completion.text.trim()) {
                return apiError(
                    res,
                    502,
                    'AI_EMPTY_RESPONSE',
                    'The AI model returned an empty response. Try switching models or increasing max output tokens.',
                );
            }

            return res.json({
                answer: completion.text,
                provider: completion.provider,
                model: completion.model,
                routedModel: completion.routedModel || completion.model,
                usage: completion.usage,
                latencyMs: completion.latencyMs,
                tokensPerSec: completion.tokensPerSec,
                groundedAt: contextSnapshot.generatedAt,
                roleScope: contextSnapshot.roleScope,
                toolsUsed: Object.keys(toolData),
            });
        } catch (err: any) {
            if (err?.message === 'NO_ACTIVE_AI_PROVIDER') {
                return apiError(
                    res,
                    503,
                    'NO_ACTIVE_AI_PROVIDER',
                    'No active AI provider is configured for this organization or platform.',
                );
            }
            console.error('[AI Assistant] Error:', err?.message || err);
            return apiError(res, 502, 'AI_PROVIDER_ERROR', err?.message || 'Failed to generate AI assistant response');
        }
    },
);

router.get(
    '/ai/signals',
    authenticateToken,
    requireOrgContext,
    requireMinimumRole('manager'),
    requireModule('analytics'),
    async (req: Request, res: Response) => {
        const orgId = req.orgId!;
        const now = new Date();
        const nowIso = now.toISOString();
        const in30DaysIso = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const staleCutoffIso = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

        try {
            const [depRes, activeRes, inqRes, paxRes, roomAssignRes] = await Promise.all([
                supabaseAdmin
                    .from('departures')
                    .select('id, depart_at, capacity, status, packages(name)')
                    .eq('org_id', orgId)
                    .gte('depart_at', nowIso)
                    .lte('depart_at', in30DaysIso)
                    .neq('status', 'cancelled')
                    .order('depart_at', { ascending: true })
                    .limit(50),
                supabaseAdmin
                    .from('reservations')
                    .select('id, departure_id, party_size, balance_due, currency, status, customer_name')
                    .eq('org_id', orgId)
                    .neq('status', 'cancelled')
                    .limit(200),
                supabaseAdmin
                    .from('inquiries')
                    .select('id, contact_name, stage, updated_at')
                    .eq('org_id', orgId)
                    .in('stage', ['new', 'proposal', 'follow_up'])
                    .lte('updated_at', staleCutoffIso)
                    .limit(50),
                supabaseAdmin
                    .from('departure_passengers')
                    .select('id, full_name, seat_number, departure_id')
                    .eq('org_id', orgId)
                    .limit(300),
                supabaseAdmin
                    .from('departure_room_slot_assignments')
                    .select('passenger_id')
                    .eq('org_id', orgId),
            ]);

            if (depRes.error || activeRes.error || inqRes.error) {
                return apiError(res, 500, 'SIGNALS_ERROR', 'Failed to compute executive signals');
            }

            const bookedByDep = new Map<string, number>();
            const openBalanceItems: Array<{ id: string; customerName: string; balanceDue: number; currency: string }> = [];
            for (const r of (activeRes.data || []) as any[]) {
                if (r.departure_id) {
                    bookedByDep.set(r.departure_id, (bookedByDep.get(r.departure_id) || 0) + Number(r.party_size || 1));
                }
                const due = Number(r.balance_due || 0);
                if (due > 0) {
                    openBalanceItems.push({
                        id: r.id,
                        customerName: r.customer_name || 'Guest',
                        balanceDue: due,
                        currency: r.currency || 'BAM',
                    });
                }
            }

            const lowOccupancyItems = ((depRes.data || []) as any[])
                .map((d) => {
                    const cap = Number(d.capacity || 0);
                    const booked = bookedByDep.get(d.id) || 0;
                    const occupancyPct = cap > 0 ? Math.round((booked / cap) * 100) : 0;
                    return {
                        id: d.id,
                        packageName: d.packages?.name || 'Departure',
                        departAt: d.depart_at,
                        booked,
                        capacity: cap,
                        occupancyPct,
                    };
                })
                .filter((d) => d.capacity > 0 && d.occupancyPct < 50);

            const staleInquiries = (inqRes.data || []) as any[];
            const upcomingDepIds = new Set(((depRes.data || []) as any[]).map((d) => d.id));
            const assignedRoomIds = new Set(((roomAssignRes.data || []) as any[]).map((a) => a.passenger_id));
            const upcomingPax = ((paxRes.data || []) as any[]).filter((p) => upcomingDepIds.has(p.departure_id));
            const missingSeatPax = upcomingPax.filter((p) => p.seat_number === null || p.seat_number === undefined);
            const missingRoomPax = upcomingPax.filter((p) => !assignedRoomIds.has(p.id));

            return res.json({
                generatedAt: nowIso,
                signals: [
                    {
                        key: 'low_occupancy_departures',
                        severity: lowOccupancyItems.length > 0 ? 'high' : 'info',
                        count: lowOccupancyItems.length,
                        route: '/departures',
                        items: lowOccupancyItems.slice(0, 5),
                    },
                    {
                        key: 'open_balance_reservations',
                        severity: openBalanceItems.length > 0 ? 'medium' : 'info',
                        count: openBalanceItems.length,
                        route: '/payments',
                        items: openBalanceItems.slice(0, 5),
                    },
                    {
                        key: 'stale_inquiries',
                        severity: staleInquiries.length > 0 ? 'medium' : 'info',
                        count: staleInquiries.length,
                        route: '/inquiries',
                        items: staleInquiries.slice(0, 5).map((i) => ({
                            id: i.id,
                            contactName: i.contact_name,
                            stage: i.stage,
                        })),
                    },
                    {
                        key: 'missing_seat_assignments',
                        severity: missingSeatPax.length > 0 ? 'medium' : 'info',
                        count: missingSeatPax.length,
                        route: '/departures',
                        items: missingSeatPax.slice(0, 5).map((p) => ({
                            id: p.id,
                            fullName: p.full_name,
                            departureId: p.departure_id,
                        })),
                    },
                    {
                        key: 'missing_room_assignments',
                        severity: missingRoomPax.length > 0 ? 'medium' : 'info',
                        count: missingRoomPax.length,
                        route: '/departures',
                        items: missingRoomPax.slice(0, 5).map((p) => ({
                            id: p.id,
                            fullName: p.full_name,
                            departureId: p.departure_id,
                        })),
                    },
                ],
            });
        } catch (err: any) {
            return apiError(res, 500, 'SIGNALS_ERROR', err?.message || 'Failed to compute signals');
        }
    },
);

export default router;
