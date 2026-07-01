import 'dotenv/config';
import { supabaseAdmin } from '../lib/supabase';

/**
 * Demo Seeding Script — Travline
 * All dates regenerated to 2026.
 */

const SEED_USER_ID = process.env.SEED_USER_ID;
const ORG_SLUG = 'elite-travel';
const ORG_NAME = 'Elite Travel';

function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const firstNames = ['Ismail', 'Amar', 'Lejla', 'Kenan', 'Selma', 'Tarik', 'Emina', 'Adnan', 'Hana', 'Dino',
    'Mirza', 'Ajla', 'Haris', 'Una', 'Faruk', 'Sara', 'Bakir', 'Nejra', 'Dženan', 'Lamija',
    'Nedim', 'Marija', 'Vedad', 'Belma', 'Aldin', 'Maja', 'Mirsad', 'Dženita', 'Emir', 'Aida'];
const lastNames = ['Alić', 'Begić', 'Hadžić', 'Smajić', 'Hodžić', 'Delić', 'Kovačević', 'Pašić', 'Babić', 'Mujić',
    'Halilović', 'Ibrahimović', 'Softić', 'Muminović', 'Avdić', 'Šabanović', 'Tahirović', 'Kurt', 'Osmanović', 'Spahić',
    'Salčinović', 'Bećirović', 'Mešić', 'Šišić', 'Hukić', 'Sirčo', 'Sarajlić', 'Zahirović', 'Gusić', 'Bešić'];

async function seed() {
    console.log('🚀 Starting demo seed — all 2026 dates...\n');

    if (!SEED_USER_ID) {
        console.error('❌ SEED_USER_ID environment variable is required.');
        process.exit(1);
    }

    // ── 1. Organization ──────────────────────────────────────────────
    const { data: org } = await supabaseAdmin
        .from('organizations')
        .upsert({ name: ORG_NAME, slug: ORG_SLUG }, { onConflict: 'slug' })
        .select()
        .single();

    const orgId = org.id;
    console.log(`✅ Organization "${ORG_NAME}" ready (ID: ${orgId})`);

    // ── 2. Profile ───────────────────────────────────────────────────
    await supabaseAdmin.from('profiles')
        .upsert({ id: SEED_USER_ID, org_id: orgId, role: 'director' }, { onConflict: 'id' });
    console.log(`✅ Profile for user ${SEED_USER_ID} ready`);

    // ── 3. Clear existing ────────────────────────────────────────────
    console.log('🧹 Clearing existing data...');
    await supabaseAdmin.from('reservations').delete().eq('org_id', orgId);
    await supabaseAdmin.from('transactions').delete().eq('org_id', orgId);
    await supabaseAdmin.from('departures').delete().eq('org_id', orgId);
    await supabaseAdmin.from('customers').delete().eq('org_id', orgId);
    await supabaseAdmin.from('packages').delete().eq('org_id', orgId);
    console.log('✓ Cleared.');

    // ── 4. Packages ─────────────────────────────────────────────────
    console.log('\n📦 Creating packages...');
    const packagesData = [
        { name: 'Istanbul Express', destination: 'Istanbul, Turkey', base_price: 550, currency: 'USD', duration_days: 3, max_participants: 20 },
        { name: 'Dubai Luxury', destination: 'Dubai, UAE', base_price: 1200, currency: 'USD', duration_days: 4, max_participants: 15 },
        { name: 'Paris Romance', destination: 'Paris, France', base_price: 900, currency: 'EUR', duration_days: 5, max_participants: 25 },
        { name: 'Cairo Wonders', destination: 'Cairo, Egypt', base_price: 750, currency: 'USD', duration_days: 6, max_participants: 20 },
        { name: 'Maldives Paradise', destination: 'Maldives', base_price: 2200, currency: 'USD', duration_days: 8, max_participants: 12 },
        { name: 'Barcelona Sun', destination: 'Barcelona, Spain', base_price: 850, currency: 'EUR', duration_days: 4, max_participants: 25 },
    ];

    const { data: insertedPackages, error: insError } = await supabaseAdmin
        .from('packages')
        .insert(packagesData.map(pkg => ({ ...pkg, org_id: orgId, is_active: true })))
        .select();

    if (insError) { console.error('Error inserting packages:', insError); process.exit(1); }
    const finalPackages = insertedPackages!;
    console.log(`✓ ${finalPackages.length} packages created`);

    // ── 5. Departures (spread across Jan–Dec 2026) ──────────────────
    console.log('✈️  Generating departures across 2026...');
    const { data: depPackages } = await supabaseAdmin.from('packages').select('*').eq('org_id', orgId);
    const deps: any[] = [];

    for (const pkg of depPackages || []) {
        const count = randInt(4, 8);
        for (let i = 0; i < count; i++) {
            const month = ((i * 3 + (deps.length % 5)) % 12) + 1;
            const day = Math.min(randInt(3, 26), 26);
            const departDate = new Date(2026, month - 1, day, 8, 0, 0);
            const returnDate = new Date(departDate);
            returnDate.setDate(returnDate.getDate() + (pkg.duration_days || 4) + randInt(0, 2));

            deps.push({
                org_id: orgId,
                package_id: pkg.id,
                depart_at: departDate.toISOString(),
                return_at: returnDate.toISOString(),
                capacity: randInt(15, 50),
                booked: 0,
                status: month <= 6 ? 'completed' : 'active',
            });
        }
    }

    const { data: finalDepartures, error: depsError } = await supabaseAdmin
        .from('departures')
        .insert(deps)
        .select();
    if (depsError) { console.error('Error inserting departures:', depsError); process.exit(1); }
    console.log(`✅ ${finalDepartures!.length} departures across 2026`);

    // ── 6. Customers (200 Bosnian names) ────────────────────────────
    console.log('👥 Creating 200 customers...');
    const customers: any[] = [];
    for (let i = 0; i < 200; i++) {
        const fn = firstNames[randInt(0, firstNames.length - 1)];
        const ln = lastNames[randInt(0, lastNames.length - 1)];
        customers.push({
            org_id: orgId,
            full_name: `${fn} ${ln}`,
            phone: `+3876${randInt(1, 9)}${String(100000 + i).slice(1, 7)}`,
            email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@email.com`,
        });
    }

    const { data: finalCustomers, error: customersError } = await supabaseAdmin
        .from('customers')
        .upsert(customers, { onConflict: 'org_id,phone' })
        .select();
    if (customersError) { console.error('Error inserting customers:', customersError); process.exit(1); }
    console.log(`✅ ${finalCustomers!.length} customers`);

    // ── 7. Reservations (Jan–Dec 2026) ──────────────────────────────
    console.log('📝 Generating reservations across all months of 2026...');
    let resCount = 0;
    let transCount = 0;

    for (let month = 1; month <= 12; month++) {
        const daysInMonth = new Date(2026, month, 0).getDate();
        const dailyRes = randInt(2, 6);

        for (let i = 0; i < dailyRes; i++) {
            const customer = finalCustomers![randInt(0, finalCustomers!.length - 1)];
            const departure = finalDepartures![randInt(0, finalDepartures!.length - 1)];
            const partySize = randInt(1, 6);
            const day = randInt(1, daysInMonth);
            const pkg = depPackages!.find(p => p.id === departure.package_id);
            const basePrice = pkg?.base_price || 800;
            const totalAmount = basePrice * partySize;
            const status = ['confirmed', 'confirmed', 'confirmed', 'pending', 'cancelled'][randInt(0, 4)];
            const paidFraction = status === 'cancelled' ? 0
                : status === 'pending' ? randInt(0, 20) / 100
                    : [0, 0.3, 0.5, 0.7, 1][randInt(0, 4)];
            const paidAmount = Math.round(totalAmount * paidFraction * 100) / 100;

            const resAt = new Date(2026, month - 1, day, randInt(8, 18), randInt(0, 59), 0);

            const { data: newRes, error: resErr } = await supabaseAdmin
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
                    paid_amount: paidAmount,
                    source: ['web', 'phone', 'agent', 'walk-in'][randInt(0, 3)],
                    currency: pkg?.currency || 'BAM',
                }])
                .select();

            if (resErr) continue;
            resCount++;

            // Update departure booked count
            if (status === 'confirmed' && newRes && newRes[0]) {
                const depData = finalDepartures!.find(d => d.id === departure.id);
                if (depData) {
                    const newBooked = Math.min((depData.booked || 0) + partySize, depData.capacity);
                    depData.booked = newBooked;
                    await supabaseAdmin.from('departures').update({ booked: newBooked }).eq('id', departure.id);
                }

                // Create transaction for paid amount
                if (paidAmount > 0 && newRes) {
                    const txDate = new Date(resAt);
                    txDate.setDate(txDate.getDate() + randInt(0, 2));

                    await supabaseAdmin
                        .from('transactions')
                        .insert([{
                            org_id: orgId,
                            reservation_id: newRes[0].id,
                            amount: paidAmount,
                            currency: pkg?.currency || 'BAM',
                            type: 'payment',
                            occurred_at: txDate.toISOString(),
                            note: `Uplata za ${customer.full_name}`,
                        }]);
                    transCount++;
                }
            }
        }
    }

    console.log(`✅ Reservations: ${resCount}`);
    console.log(`✅ Transactions: ${transCount}`);
    console.log('\n✨ Seeding complete! All dates are from 2026.');
}

seed().catch(err => {
    console.error('💥 Fatal seeding error:', err);
    process.exit(1);
});
