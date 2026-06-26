import { Router } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireRole } from '../middleware/requireRole';
import { supabaseAdmin } from '../lib/supabase';
import { config } from '../config';
import { apiError } from "../lib/errors";

const router = Router();

/**
 * Dev-only guard: the entire /api/debug surface is disabled outside development.
 * Returns 404 (not 403) so the surface is not advertised in production.
 */
router.use((req, res, next) => {
    if (config.NODE_ENV !== 'development') {
        return apiError(res, 404, "NOT_FOUND", "Not found");
    }
    next();
});

// All debug routes require authentication, org context, and super_admin role.
router.use(authenticateToken, requireOrgContext, requireRole(['super_admin']));

/**
 * GET /api/debug/env-check
 * Returns presence status of core environment variables without revealing values.
 * Dev-only; super_admin gated.
 */
router.get('/env-check', async (req, res) => {
    try {
        res.json({
            hasUrl: !!config.SUPABASE_URL,
            hasServiceKey: !!config.SUPABASE_SERVICE_ROLE_KEY,
            nodeEnv: config.NODE_ENV,
            port: config.PORT,
        });
    } catch (error) {
        console.error('Error in /debug/env-check:', error);
        apiError(res, 500, "INTERNAL_ERROR", "Internal server error");
    }
});

/**
 * POST /api/debug/seed-demo
 * Generates mock data for the current org.
 * Dev-only; super_admin gated.
 */
router.post('/seed-demo', async (req, res) => {
    try {
        const orgId = req.orgId!;
        const days = parseInt(req.query.days as string) || 30;
        const count = parseInt(req.query.count as string) || 50;

        // 1. Ensure we have at least one package and departure
        const { data: existingDepartures } = await supabaseAdmin
            .from('departures')
            .select('*, packages(*)')
            .eq('org_id', orgId)
            .limit(10);

        let departures = existingDepartures || [];

        if (departures.length === 0) {
            // Create a dummy package if none exists
            let { data: pkg } = await supabaseAdmin
                .from('packages')
                .select('*')
                .eq('org_id', orgId)
                .limit(1)
                .single();

            if (!pkg) {
                const { data: newPkg, error: pkgErr } = await supabaseAdmin
                    .from('packages')
                    .insert({
                        org_id: orgId,
                        name: 'Seeded Demo Package',
                        destination: 'Demo City',
                        base_price: 1500,
                        currency: 'BAM',
                        is_active: true
                    })
                    .select()
                    .single();

                if (pkgErr) throw pkgErr;
                pkg = newPkg;
            }

            // Create a few departures
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 30);

            const { data: newDepartures, error: depErr } = await supabaseAdmin
                .from('departures')
                .insert([
                    {
                        org_id: orgId,
                        package_id: pkg.id,
                        depart_at: futureDate.toISOString(),
                        return_at: new Date(futureDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                        capacity: 50,
                        status: 'active'
                    }
                ])
                .select('*, packages(*)');

            if (depErr) throw depErr;
            departures = newDepartures || [];
        }

        const firstNames = ['Ismail', 'Amar', 'Leila', 'Emina', 'Kenan', 'Adnan', 'Selma', 'Tarik'];
        const lastNames = ['Ali', 'Begović', 'Hodžić', 'Hadžić', 'Marić', 'Kovač', 'Delić'];

        const reservations = [];
        const transactions = [];

        for (let i = 0; i < count; i++) {
            const departure = departures[Math.floor(Math.random() * departures.length)];
            const partySize = Math.floor(Math.random() * 4) + 1;
            const basePrice = parseFloat(departure.packages?.base_price || (Math.random() * 2000 + 200).toString());
            const totalAmount = basePrice * partySize;

            const reservationAt = new Date();
            reservationAt.setDate(reservationAt.getDate() - Math.floor(Math.random() * days));

            const customerName = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;

            // Create reservation
            const { data: reservation, error: resErr } = await supabaseAdmin
                .from('reservations')
                .insert({
                    org_id: orgId,
                    customer_name: customerName,
                    party_size: partySize,
                    reservation_at: reservationAt.toISOString(),
                    status: i % 10 === 0 ? 'cancelled' : 'confirmed',
                    total_amount: totalAmount,
                    currency: 'BAM',
                    departure_id: departure.id,
                    paid_amount: 0 // Will update after transaction
                })
                .select()
                .single();

            if (resErr) continue;

            // Create transaction for ~80% of reservations
            if (Math.random() < 0.8 && reservation.status !== 'cancelled') {
                const paidAmount = Math.random() < 0.9 ? totalAmount : totalAmount / 2;

                const { error: txErr } = await supabaseAdmin
                    .from('transactions')
                    .insert({
                        org_id: orgId,
                        amount: paidAmount,
                        currency: 'BAM',
                        type: 'payment',
                        note: `Demo payment for ${customerName}`,
                        occurred_at: reservationAt.toISOString(),
                        reservation_id: reservation.id
                    });

                if (!txErr) {
                    // Update reservation paid_amount
                    await supabaseAdmin
                        .from('reservations')
                        .update({ paid_amount: paidAmount })
                        .eq('id', reservation.id);

                    transactions.push(reservation.id);
                }
            }

            reservations.push(reservation.id);
        }

        res.json({
            message: 'Demo data seeded successfully',
            reservationsCreated: reservations.length,
            transactionsCreated: transactions.length
        });

    } catch (error) {
        console.error('Error seeding demo data:', error);
        apiError(res, 500, "INTERNAL_ERROR", "Failed to seed demo data", error instanceof Error ? error.message : String(error));
    }
});

export default router;
