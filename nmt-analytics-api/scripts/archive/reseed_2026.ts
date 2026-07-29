import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hacutwknfgufrqlgdiia.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhY3V0d2tuZmd1ZnJxbGdkaWlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTgyMTg0MSwiZXhwIjoyMDgxMzk3ODQxfQ.T8cdnLyc1cHm4rMvXDD8GrfmN2G-LRaq5PIBk7jaba0';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ORG_ID = 'd9c9c298-9c09-4b0e-a91c-483758431d74';

const PACKAGE_NAMES: Record<string, { base_price: number; duration_days: number }> = {
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

const FIRST_NAMES = ['Ismail', 'Amar', 'Leila', 'Kenan', 'Selma', 'Tarik', 'Emina', 'Adnan', 'Hana', 'Dino', 'Mirza', 'Nina', 'Faruk', 'Amila', 'Haris', 'Sara', 'Elvir', 'Maja', 'Damir', 'Tajra'];
const LAST_NAMES = ['Alić', 'Begić', 'Hadžić', 'Smajić', 'Hodžić', 'Delić', 'Kovačević', 'Pašić', 'Babić', 'Mujić', 'Halilović', 'Osmanović', 'Ibrahimović', 'Softić', 'Mešić'];

function randomBetween(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function randomDate(start = new Date(2026, 0, 1), end = new Date(2026, 11, 31)) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomChoice<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

async function main() {
  console.log('🚀 Reseeding Travline org with 2026 dates...\n');

  // 1. DELETE existing data (order matters for FK)
  console.log('🗑️  Deleting existing data...');
  await supabase.from('notifications').delete().eq('org_id', ORG_ID);
  await supabase.from('payment_links').delete().eq('org_id', ORG_ID);
  console.log('   Deleting transactions...');
  await supabase.from('transactions').delete().eq('org_id', ORG_ID);
  console.log('   Deleting reservations...');
  await supabase.from('reservations').delete().eq('org_id', ORG_ID);
  console.log('   Deleting departures...');
  await supabase.from('departures').delete().eq('org_id', ORG_ID);
  console.log('   Keeping customers (1001 existing)\n');

  // 2. Get packages
  const { data: packages } = await supabase.from('packages').select('*').eq('org_id', ORG_ID);
  if (!packages || packages.length === 0) { console.error('No packages found!'); return; }
  console.log(`📦 Found ${packages.length} packages`);

  // 3. Generate DEPARTURES for 2026 — multiple per package across the year
  console.log('\n✈️  Generating departures...');
  const departures: any[] = [];
  for (const pkg of packages) {
    const pkgInfo = PACKAGE_NAMES[pkg.name] || { base_price: 1000, duration_days: 5 };
    const numDepartures = randomBetween(4, 8); // 4-8 departures per package spread across year
    for (let i = 0; i < numDepartures; i++) {
      const departDate = randomDate();
      const returnDate = new Date(departDate);
      returnDate.setDate(returnDate.getDate() + (pkgInfo.duration_days || 5));
      
      // Some departures already partially booked (realistic), some empty (future)
      const isPast = departDate < new Date();
      departures.push({
        org_id: ORG_ID,
        package_id: pkg.id,
        depart_at: departDate.toISOString(),
        return_at: returnDate.toISOString(),
        capacity: randomBetween(20, 55),
        booked: 0,
        status: isPast ? (Math.random() < 0.1 ? 'cancelled' : 'completed') : 'active',
      });
    }
  }

  // Insert in batches
  for (let i = 0; i < departures.length; i += 20) {
    const batch = departures.slice(i, i + 20);
    const { error } = await supabase.from('departures').insert(batch);
    if (error) console.error(`  Batch ${i} error:`, error.message);
  }
  console.log(`  Created ${departures.length} departures`);

  // Fetch created departures
  const { data: createdDepartures } = await supabase.from('departures').select('*').eq('org_id', ORG_ID);
  if (!createdDepartures) { console.error('No departures created'); return; }

  // 4. Get customers
  const { data: customers } = await supabase.from('customers').select('*').eq('org_id', ORG_ID);
  const finalCustomers = customers || [];

  // Create more customers if needed (up to 500)
  let newCustomers = 0;
  if (finalCustomers.length < 500) {
    const toCreate: any[] = [];
    for (let i = 0; i < 500 - finalCustomers.length; i++) {
      toCreate.push({
        org_id: ORG_ID,
        full_name: `${randomChoice(FIRST_NAMES)} ${randomChoice(LAST_NAMES)}`,
        phone: `+3876${randomBetween(0,1)}${String(randomBetween(0, 999999)).padStart(6, '0')}`,
        email: `${randomChoice(FIRST_NAMES).toLowerCase()}.${randomChoice(LAST_NAMES).toLowerCase()}${i}@example.com`,
      });
    }
    for (let i = 0; i < toCreate.length; i += 50) {
      const { error } = await supabase.from('customers').upsert(
        toCreate.slice(i, i + 50), 
        { onConflict: 'org_id,phone' }
      );
      if (error) console.error(`  Customer batch ${i} error:`, error.message);
    }
    newCustomers = toCreate.length;
  }
  const { data: allCustomers } = await supabase.from('customers').select('*').eq('org_id', ORG_ID);
  const finalAllCustomers = allCustomers || finalCustomers;
  console.log(`👥 Customers: ${finalAllCustomers.length} (${newCustomers} new)`);

  // 5. Generate RESERVATIONS spread across Jan-Jun 2026 (past) and some future
  console.log('\n📝 Generating reservations...');
  let resCount = 0;
  let txCount = 0;

  for (let d = 0; d < 365; d++) {
    const currentDate = new Date(2026, 0, 1);
    currentDate.setDate(currentDate.getDate() + d);

    const isFuture = currentDate > new Date();
    const dailyResCount = isFuture ? randomBetween(0, 5) : randomBetween(1, 20);

    for (let i = 0; i < dailyResCount; i++) {
      const customer = randomChoice(finalAllCustomers);
      const departure = randomChoice(createdDepartures);
      const partySize = randomBetween(1, 6);
      const pkg = packages.find(p => p.id === departure.package_id);
      const basePrice = PACKAGE_NAMES[pkg?.name || '']?.base_price || 1000;
      const totalAmount = basePrice * partySize;

      const resAt = new Date(currentDate);
      resAt.setHours(randomBetween(8, 20));

      const { data: reservation, error: resErr } = await supabase.from('reservations').insert({
        org_id: ORG_ID,
        customer_id: customer.id,
        customer_name: customer.full_name,
        customer_phone: customer.phone,
        departure_id: departure.id,
        party_size: partySize,
        reservation_at: resAt.toISOString(),
        status: 'confirmed',
        total_amount: totalAmount,
        currency: 'BAM',
        source: randomChoice(['web', 'phone', 'agent', 'walk-in']),
      }).select().single();

      if (resErr) continue;
      resCount++;

      // Update departure booked count
      if (departure.booked !== undefined) {
        await supabase.from('departures').update({ 
          booked: Math.min((departure.booked || 0) + partySize, departure.capacity) 
        }).eq('id', departure.id);
      }

      // 70% chance of payment
      if (Math.random() < 0.7) {
        const paidPct = randomChoice([1, 1, 1, 0.5, 0.25, 1, 1, 0.5]);
        const paidAmount = Math.round(totalAmount * paidPct);
        if (paidAmount > 0) {
          const payDate = new Date(resAt);
          payDate.setHours(payDate.getHours() + randomBetween(1, 48));

          await supabase.from('transactions').insert({
            org_id: ORG_ID,
            reservation_id: reservation.id,
            amount: paidAmount,
            currency: 'BAM',
            type: 'payment',
            occurred_at: payDate.toISOString(),
            note: `Uplata za ${customer.full_name}`,
          }).then(() => txCount++);
        }
      }
    }
  }

  console.log(`  Created ${resCount} reservations`);
  console.log(`  Created ${txCount} payment transactions`);

  // 6. Update paid_amount on reservations
  console.log('\n💰 Syncing paid amounts...');
  await supabase.rpc('sync_paid_amounts');
  
  // Final counts
  const { count: finalRes } = await supabase.from('reservations').select('*', { count: 'exact', head: true }).eq('org_id', ORG_ID);
  const { count: finalDep } = await supabase.from('departures').select('*', { count: 'exact', head: true }).eq('org_id', ORG_ID);
  const { count: finalTx } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('org_id', ORG_ID);

  console.log(`\n✅ Done! Final counts:`);
  console.log(`   Packages: ${packages.length}`);
  console.log(`   Departures: ${finalDep}`);
  console.log(`   Customers: ${finalAllCustomers.length}`);
  console.log(`   Reservations: ${finalRes}`);
  console.log(`   Transactions: ${finalTx}`);
}

main().catch(console.error);
