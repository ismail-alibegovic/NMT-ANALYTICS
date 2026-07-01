import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hacutwknfgufrqlgdiia.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhY3V0d2tuZmd1ZnJxbGdkaWlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTgyMTg0MSwiZXhwIjoyMDgxMzk3ODQxfQ.T8cdnLyc1cHm4rMvXDD8GrfmN2G-LRaq5PIBk7jaba0';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ORG_ID = 'd9c9c298-9c09-4b0e-a91c-483758431d74';

const PACKAGE_INFO: Record<string, { base_price: number; duration_days: number }> = {
  "Istanbul Express": { base_price: 550, duration_days: 3 },
  "Antalya Summer": { base_price: 1200, duration_days: 5 },
  "Dubai Luxury": { base_price: 2500, duration_days: 4 },
  "Umrah Premium": { base_price: 3200, duration_days: 10 },
  "Paris City Break": { base_price: 900, duration_days: 4 },
  "Rome Historical": { base_price: 850, duration_days: 5 },
  "Cairo Wonders": { base_price: 1100, duration_days: 6 },
  "Barcelona Sun": { base_price: 950, duration_days: 4 },
  "Djerba Maj 2026": { base_price: 1100, duration_days: 7 },
  "Zanzibar Escape": { base_price: 1500, duration_days: 8 },
};

const FIRST_NAMES = ['Ismail','Amar','Leila','Kenan','Selma','Tarik','Emina','Adnan','Hana','Dino','Mirza','Nina','Faruk','Amila','Haris','Sara','Elvir','Maja','Damir','Tajra'];
const LAST_NAMES = ['Alić','Begić','Hadžić','Smajić','Hodžić','Delić','Kovačević','Pašić','Babić','Mujić','Halilović','Osmanović','Ibrahimović','Softić','Mešić'];

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function randDate() { return new Date(2026, 0, 1 + Math.floor(Math.random() * 364), rand(8, 20), rand(0, 59)); }

async function main() {
  console.log('🚀 Reseeding NMT Analytics org with 2026 dates...\n');

  // 1. DELETE
  console.log('🗑️  Deleting old data...');
  for (const table of ['notifications', 'payment_links', 'transactions', 'reservations', 'departures']) {
    const { error } = await supabase.from(table as any).delete().eq('org_id', ORG_ID);
    if (error) console.error(`  ${table}: ${error.message}`);
    else console.log(`  ✓ ${table} cleared`);
  }

  // 2. GET packages
  const { data: packages } = await supabase.from('packages').select('*').eq('org_id', ORG_ID);
  if (!packages?.length) { console.error('No packages'); return; }
  console.log(`\n📦 ${packages.length} packages`);

  // 3. DEPARTURES — 4-8 per package across 2026
  console.log('✈️  Generating departures...');
  const deps: any[] = [];
  for (const pkg of packages) {
    const info = PACKAGE_INFO[pkg.name] || { base_price: 1000, duration_days: 5 };
    for (let i = 0; i < rand(4, 8); i++) {
      const d = randDate();
      const r = new Date(d); r.setDate(r.getDate() + info.duration_days);
      deps.push({
        org_id: ORG_ID, package_id: pkg.id,
        depart_at: d.toISOString(), return_at: r.toISOString(),
        capacity: rand(20, 55), booked: 0,
        status: d < new Date() ? (Math.random() < 0.1 ? 'cancelled' : 'completed') : 'active',
      });
    }
  }
  const { data: createdDeps } = await supabase.from('departures').insert(deps).select();
  if (!createdDeps?.length) { console.error('Failed to create departures'); return; }
  console.log(`  ✓ ${createdDeps.length} departures`);

  // 4. GET customers
  let { data: customers } = await supabase.from('customers').select('*').eq('org_id', ORG_ID);
  if (!customers?.length) {
    const cs: any[] = [];
    for (let i = 0; i < 500; i++) cs.push({
      org_id: ORG_ID,
      full_name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      phone: `+3876${rand(0,1)}${String(rand(0,999999)).padStart(6,'0')}`,
      email: `${pick(FIRST_NAMES).toLowerCase()}.${pick(LAST_NAMES).toLowerCase()}${i}@example.com`,
    });
    const { data: ins } = await supabase.from('customers').upsert(cs, { onConflict: 'org_id,phone' }).select();
    customers = ins || [];
  }
  console.log(`👥 ${customers.length} customers`);

  // 5. RESERVATIONS + TRANSACTIONS in weekly batches
  console.log('📝 Generating reservations & payments...');
  const pkgMap = new Map(packages.map(p => [p.id, PACKAGE_INFO[p.name]?.base_price || 1000]));

  let totalRes = 0, totalTx = 0;

  for (let month = 0; month < 12; month++) {
    const daysInMonth = new Date(2026, month + 1, 0).getDate();
    const monthRes: any[] = [];
    const monthTx: any[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(2026, month, day, rand(8, 20), rand(0, 59));
      const isFuture = dayDate > new Date();
      const count = isFuture ? rand(0, 5) : rand(1, 15);

      for (let i = 0; i < count; i++) {
        const cust = pick(customers);
        const dep = pick(createdDeps);
        const partySize = rand(1, 6);
        const basePrice = pkgMap.get(dep.package_id) || 1000;
        const totalAmount = basePrice * partySize;

        const resId = crypto.randomUUID();
        monthRes.push({
          id: resId, org_id: ORG_ID,
          customer_id: cust.id, customer_name: cust.full_name, customer_phone: cust.phone,
          departure_id: dep.id, party_size: partySize,
          reservation_at: dayDate.toISOString(), status: 'confirmed',
          total_amount: totalAmount, paid_amount: 0, currency: 'BAM',
          source: pick(['web','phone','agent','walk-in']),
        });

        totalRes++;
      }
    }

    if (monthRes.length > 0) {
      const { error: rErr } = await supabase.from('reservations').insert(monthRes);
      if (rErr) console.error(`  Month ${month+1} reservation error:`, rErr.message);
    }

    if (monthTx.length > 0) {
      const { error: tErr } = await supabase.from('transactions').insert(monthTx);
      if (tErr) console.error(`  Month ${month+1} tx error:`, tErr.message);
    }
    if (month < 6) {
      const { error: tErr } = await supabase.from('transactions').insert(monthTx);
      if (tErr) console.error(`  Month ${month+1} t2 error:`, tErr.message);
    }

    process.stdout.write(`  Month ${month+1}/12: ${monthRes.length} reservations, ${monthTx.length} payments\n`);
  }

  console.log(`\n   Total: ${totalRes} reservations, ${totalTx} transactions`);

  console.log('\n💰 Syncing paid amounts...');
  await supabase.from('reservations').update({ paid_amount: 0 }).eq('org_id', ORG_ID);

  const { count: finalRes } = await supabase.from('reservations').select('*', { count: 'exact', head: true }).eq('org_id', ORG_ID);
  const { count: finalDep } = await supabase.from('departures').select('*', { count: 'exact', head: true }).eq('org_id', ORG_ID);
  const { count: finalTx } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('org_id', ORG_ID);
  const { count: finalCust } = await supabase.from('customers').select('*', { count: 'exact', head: true }).eq('org_id', ORG_ID);

  console.log(`\n✅ DONE! Final counts:`);
  console.log(`   Packages: ${packages.length}`);
  console.log(`   Departures: ${finalDep}`);
  console.log(`   Customers: ${finalCust}`);
  console.log(`   Reservations: ${finalRes}`);
  console.log(`   Transactions: ${finalTx}`);
}

main().catch(console.error);
