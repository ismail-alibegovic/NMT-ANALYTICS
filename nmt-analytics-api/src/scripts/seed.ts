#!/usr/bin/env tsx
/**
 * Seed script for Travline
 * ALL dates are in 2026 — fresh data for current year.
 * Usage: npm run seed:dev
 */

import { supabaseAdmin } from '../lib/supabase';
import { config } from '../config';

const ORG_NAME = 'Demo Travel Agency';
const ORG_SLUG = 'demo-travel';
const ADMIN_EMAIL = 'admin@demo.com';

function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
    console.log('🌱 Starting seed process (all dates → 2026)...\n');

    // ── 1. Create / Get Organisation ──────────────────────────────────
    console.log('📦 Creating organization...');
    const { data: existingOrg } = await supabaseAdmin
        .from('organizations')
        .select('id, name')
        .eq('slug', ORG_SLUG)
        .single();

    let orgId: string;
    if (existingOrg) {
        orgId = existingOrg.id;
        console.log(`✓ Organization exists: ${existingOrg.name} (${orgId})`);
    } else {
        const { data: newOrg, error } = await supabaseAdmin
            .from('organizations')
            .insert({ name: ORG_NAME, slug: ORG_SLUG })
            .select()
            .single();

        if (error) throw error;
        orgId = newOrg.id;
        console.log(`✓ Created organization: ${ORG_NAME} (${orgId})`);
    }

    // ── 2. Admin Profile ──────────────────────────────────────────────
    console.log('\n👤 Creating admin profile...');
    const adminId = '00000000-0000-0000-0000-000000000001';
    const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
            id: adminId,
            email: ADMIN_EMAIL,
            role: 'director',
            org_id: orgId
        }, { onConflict: 'id' });

    if (profileError) {
        console.log(`⚠ Profile upsert warning: ${profileError.message}`);
    } else {
        console.log(`✓ Admin profile ready: ${ADMIN_EMAIL}`);
    }

    // ── 3. Clear existing demo data ───────────────────────────────────
    console.log('\n🧹 Clearing existing demo data...');
    await supabaseAdmin.from('reservations').delete().eq('org_id', orgId);
    await supabaseAdmin.from('transactions').delete().eq('org_id', orgId);
    await supabaseAdmin.from('departures').delete().eq('org_id', orgId);
    await supabaseAdmin.from('customers').delete().eq('org_id', orgId);
    await supabaseAdmin.from('packages').delete().eq('org_id', orgId);
    console.log('✓ Existing data cleared.');

    // ── 4. Create Packages (8 real packages) ──────────────────────────
    console.log('\n📦 Creating packages...');
    const packages = [
        { name: 'Dubai Luxury', destination: 'Dubai, UAE', base_price: 1800, duration_days: 5 },
        { name: 'Istanbul Express', destination: 'Istanbul, Turkey', base_price: 550, duration_days: 3 },
        { name: 'Cairo Wonders', destination: 'Cairo, Egypt', base_price: 950, duration_days: 6 },
        { name: 'Maldives Paradise', destination: 'Maldives', base_price: 2800, duration_days: 8 },
        { name: 'Barcelona Sun', destination: 'Barcelona, Spain', base_price: 1100, duration_days: 4 },
        { name: 'Amalfi Coast', destination: 'Naples, Italy', base_price: 1500, duration_days: 5 },
        { name: 'London Classic', destination: 'London, UK', base_price: 800, duration_days: 3 },
        { name: 'Santorini Escape', destination: 'Santorini, Greece', base_price: 1300, duration_days: 5 },
    ];

    const { data: createdPackages, error: pkgError } = await supabaseAdmin
        .from('packages')
        .upsert(
            packages.map(pkg => ({
                ...pkg,
                org_id: orgId,
                currency: 'BAM',
                is_active: true,
            })),
            { onConflict: 'org_id,name,destination' }
        )
        .select();

    if (pkgError) throw pkgError;
    console.log(`✓ Created ${createdPackages.length} packages`);

    // ── 5. Create Departures (spread across 2026 months) ──────────────
    console.log('\n✈️  Creating departures...');
    const departures: any[] = [];

    createdPackages.forEach((pkg, pkgIdx) => {
        const depCount = 3 + (pkgIdx % 3);
        for (let i = 0; i < depCount; i++) {
            const month = ((pkgIdx * 2 + i * 3) % 12) + 1;
            const day = Math.min(8 + (i * 6), 28);
            const depDate = new Date(2026, month - 1, day, 9, 0, 0);
            const retDate = new Date(depDate);
            retDate.setDate(retDate.getDate() + (pkg.duration_days || 5));

            departures.push({
                org_id: orgId,
                package_id: pkg.id,
                depart_at: depDate.toISOString(),
                return_at: retDate.toISOString(),
                capacity: 20 + (pkgIdx * 5) + (i * 3),
                booked: i === 0 ? 0 : randInt(3, 18),
                status: month <= 6 ? 'completed' : 'active',
            });
        }
    });

    const { data: createdDepartures, error: depError } = await supabaseAdmin
        .from('departures')
        .insert(departures)
        .select();

    if (depError) throw depError;
    console.log(`✓ Created ${createdDepartures.length} departures across 2026`);

    // ── 6. Create Customers (50 Bosnian names) ─────────────────────────
    console.log('\n👥 Creating customers...');
    const firstNames = ['Ismail', 'Amar', 'Lejla', 'Kenan', 'Selma', 'Tarik', 'Emina', 'Adnan', 'Hana', 'Dino',
        'Mirza', 'Ajla', 'Haris', 'Una', 'Faruk', 'Sara', 'Bakir', 'Nejra', 'Dženan', 'Lamija'];
    const lastNames = ['Alić', 'Begić', 'Hadžić', 'Smajić', 'Hodžić', 'Delić', 'Kovačević', 'Pašić', 'Babić', 'Mujić',
        'Halilović', 'Ibrahimović', 'Softić', 'Muminović', 'Avdić', 'Šabanović', 'Tahirović', 'Kurt', 'Osmanović', 'Spahić'];

    const customers: any[] = [];
    for (let i = 0; i < 50; i++) {
        const fn = firstNames[i % firstNames.length];
        const ln = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
        customers.push({
            org_id: orgId,
            full_name: `${fn} ${ln}`,
            phone: `+3876${randInt(1, 9)}${String(100000 + i).slice(1, 7)}`,
            email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@email.com`,
        });
    }

    const { data: createdCustomers, error: custError } = await supabaseAdmin
        .from('customers')
        .upsert(customers, { onConflict: 'org_id,phone' })
        .select();

    if (custError) throw custError;
    console.log(`✓ Created ${createdCustomers.length} customers`);

    // ── 7. Create Reservations (spread across all 12 months 2026) ─────
    console.log('\n📝 Creating reservations across Jan–Dec 2026...');

    const reservationStatuses = ['confirmed', 'confirmed', 'confirmed', 'pending', 'cancelled'];
    let resCount = 0;

    for (let month = 1; month <= 12; month++) {
        const dailyRes = 2 + randInt(0, 4);
        for (let i = 0; i < dailyRes; i++) {
            const customer = createdCustomers[randInt(0, createdCustomers.length - 1)];
            const departure = createdDepartures[randInt(0, createdDepartures.length - 1)];
            const partySize = randInt(1, 6);
            const day = Math.min(randInt(1, 28), 28);
            const dep = createdPackages.find(p => p.id === departure.package_id);
            const totalAmount = (dep?.base_price || 1000) * partySize;
            const status = reservationStatuses[randInt(0, reservationStatuses.length - 1)];
            const paidFraction = status === 'cancelled' ? 0
                : status === 'pending' ? randInt(0, 20) / 100
                    : [0, 0.3, 0.5, 0.7, 1][randInt(0, 4)];

            const resAt = new Date(2026, month - 1, day, randInt(8, 18), 0, 0);

            const { error: resErr } = await supabaseAdmin
                .from('reservations')
                .insert([{
                    org_id: orgId,
                    customer_id: customer.id,
                    customer_name: customer.full_name,
                    customer_phone: customer.phone,
                    departure_id: departure.id,
                    party_size: partySize,
                    reservation_at: resAt.toISOString(),
                    status,
                    total_amount: totalAmount,
                    paid_amount: Math.round(totalAmount * paidFraction * 100) / 100,
                    source: ['web', 'phone', 'agent', 'walk-in'][randInt(0, 3)],
                    currency: 'BAM',
                }]);

            if (!resErr) resCount++;

            // Update departure booked count
            if (status === 'confirmed' && !resErr) {
                const { data: depData } = await supabaseAdmin
                    .from('departures')
                    .select('booked, capacity')
                    .eq('id', departure.id)
                    .single();

                if (depData) {
                    const newBooked = Math.min((depData.booked || 0) + partySize, depData.capacity);
                    await supabaseAdmin
                        .from('departures')
                        .update({ booked: newBooked })
                        .eq('id', departure.id);
                }
            }
        }
    }
    console.log(`✓ Created ${resCount} reservations across all 12 months of 2026`);

    // ── 8. Create Payments / Transactions ─────────────────────────────
    console.log('\n💰 Creating payment transactions...');
    const { data: allReservations } = await supabaseAdmin
        .from('reservations')
        .select('id, paid_amount, reservation_at')
        .eq('org_id', orgId);

    let txCount = 0;
    for (const res of allReservations || []) {
        if (!res.paid_amount || res.paid_amount <= 0) continue;

        const txDate = new Date(res.reservation_at);
        txDate.setDate(txDate.getDate() + randInt(0, 3));

        const { error: txErr } = await supabaseAdmin
            .from('transactions')
            .insert([{
                org_id: orgId,
                reservation_id: res.id,
                amount: res.paid_amount,
                currency: 'BAM',
                type: 'payment',
                occurred_at: txDate.toISOString(),
                note: `Uplata za rezervaciju ${res.id.slice(0, 8)}`,
            }]);

        if (!txErr) txCount++;
    }
    console.log(`✓ Created ${txCount} payment transactions`);

    // ── Summary ────────────────────────────────────────────────────────
    console.log('\n✅ Seed completed successfully!');
    console.log(`\n📊 Summary (all dates → 2026):`);
    console.log(`   Organization: ${ORG_NAME} (${orgId})`);
    console.log(`   Packages: ${createdPackages.length}`);
    console.log(`   Departures: ${createdDepartures.length}`);
    console.log(`   Customers: ${createdCustomers.length}`);
    console.log(`   Reservations: ${resCount}`);
    console.log(`   Payments: ${txCount}`);
    console.log(`\n💡 Set DEV_ORG_ID=${orgId} in .env\n`);
}

seed()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
