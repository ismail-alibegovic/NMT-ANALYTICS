import 'dotenv/config';
import { supabaseAdmin } from '../lib/supabase';

/**
 * Demo Seeding Script for nmt-analytics-api
 * 
 * Generates realistic data for "Elite Travel" organization.
 */

const SEED_USER_ID = process.env.SEED_USER_ID;
const ORG_SLUG = 'elite-travel';
const ORG_NAME = 'Elite Travel';

async function seed() {
  console.log('🚀 Starting demo seed...');

  if (!SEED_USER_ID) {
    console.error('❌ SEED_USER_ID environment variable is required.');
    process.exit(1);
  }

  // 1. Ensure Organization exists
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .upsert({ name: ORG_NAME, slug: ORG_SLUG }, { onConflict: 'slug' })
    .select()
    .single();

  if (orgError) {
    console.error('❌ Error ensuring organization:', orgError);
    return;
  }
  const orgId = org.id;
  console.log(`✅ Organization "Elite Travel" ready (ID: ${orgId})`);

  // 2. Ensure Profile exists for SEED_USER_ID
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({ id: SEED_USER_ID, org_id: orgId, role: 'director' }, { onConflict: 'id' });

  if (profileError) {
    console.error('❌ Error ensuring profile:', profileError);
    // Continue anyway as profile might exist in auth but not yet in our table
  } else {
    console.log(`✅ Profile for user ${SEED_USER_ID} ready`);
  }

  // 3. Generate Packages
  // Check for existing packages first for idempotency
  const { data: existingPackages } = await supabaseAdmin.from('packages').select('*').eq('org_id', orgId);

  let finalPackages = existingPackages || [];
  let packagesCreated = 0;

  if (finalPackages.length === 0) {
    const packagesData = [
      {
        org_id: orgId,
        name: 'Istanbul Express',
        destination: 'Istanbul, Turkey',
        base_price: 550,
        currency: 'USD',
        description: 'Quick 3-day cultural tour of Istanbul with Bosphorus cruise',
        duration_days: 3,
        max_participants: 20,
        start_date: '2024-06-01',
        end_date: '2024-08-31'
      },
      {
        org_id: orgId,
        name: 'Dubai Luxury Weekend',
        destination: 'Dubai, UAE',
        base_price: 1200,
        currency: 'USD',
        description: 'Luxury 4-day desert safari and city exploration',
        duration_days: 4,
        max_participants: 15,
        start_date: '2024-09-01',
        end_date: '2024-12-31'
      },
      {
        org_id: orgId,
        name: 'Paris Romance',
        destination: 'Paris, France',
        base_price: 900,
        currency: 'EUR',
        description: 'Romantic 5-day Seine cruise and Eiffel Tower experience',
        duration_days: 5,
        max_participants: 25,
        start_date: '2024-04-01',
        end_date: '2024-10-31'
      }
    ];

    const { data: insertedPackages, error: insError } = await supabaseAdmin
      .from('packages')
      .insert(packagesData)
      .select();

    if (insError) {
      console.error('Error inserting packages:', insError);
    } else {
      finalPackages = insertedPackages || [];
      packagesCreated = finalPackages.length;
    }
  }

  console.log(`Demo packages created: ${packagesCreated}`);

  // 4. Generate Departures
  // Check for existing departures first for idempotency
  const { data: existingDepartures } = await supabaseAdmin.from('departures').select('*').eq('org_id', orgId);

  let finalDepartures = existingDepartures || [];
  if (finalDepartures.length === 0) {
    // 90 days window
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(new Date().getDate() - 90);

    const departuresToInsert = [];
    for (const pkg of finalPackages) {
      // 3-12 departures per package
      const count = Math.floor(Math.random() * 10) + 3;
      for (let i = 0; i < count; i++) {
        const departDate = new Date(ninetyDaysAgo);
        departDate.setDate(departDate.getDate() + Math.floor(Math.random() * 90));

        const returnDate = new Date(departDate);
        returnDate.setDate(returnDate.getDate() + Math.floor(Math.random() * 7) + 3);

        departuresToInsert.push({
          org_id: orgId,
          package_id: pkg.id,
          depart_at: departDate.toISOString(),
          return_at: returnDate.toISOString(),
          capacity: Math.floor(Math.random() * 36) + 20, // 20-55
          booked: 0,
          status: 'active'
        });
      }
    }

    const { data: departures, error: departuresError } = await supabaseAdmin
      .from('departures')
      .insert(departuresToInsert)
      .select();

    if (departuresError) console.error('Error inserting departures:', departuresError);
    finalDepartures = departures || [];
  }
  console.log(`✅ Departures ready: ${finalDepartures.length}`);

  // 5. Generate Customers
  const firstNames = ['Ismail', 'Amar', 'Leila', 'Kenan', 'Selma', 'Tarik', 'Emina', 'Adnan', 'Hana', 'Dino'];
  const lastNames = ['Alić', 'Begić', 'Hadžić', 'Smajić', 'Hodžić', 'Delić', 'Kovačević', 'Pašić', 'Babić', 'Mujić'];
  
  const customersToInsert = [];
  for (let i = 0; i < 200; i++) {
    const fName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lName = lastNames[Math.floor(Math.random() * lastNames.length)];
    customersToInsert.push({
      org_id: orgId,
      full_name: `${fName} ${lName}`,
      phone: `+3876${Math.floor(Math.random() * 2)}${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
      email: `${fName.toLowerCase()}.${lName.toLowerCase()}${i}@example.com`,
    });
  }

  const { data: customers, error: customersError } = await supabaseAdmin
    .from('customers')
    .upsert(customersToInsert, { onConflict: 'org_id,phone' })
    .select();

  if (customersError) console.error('Error inserting customers:', customersError);
  const finalCustomers = customers || [];
  console.log(`✅ Customers ready: ${finalCustomers.length}`);

  // 6. Generate Reservations & Transactions
  // 90 days window for reservations and transactions
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(new Date().getDate() - 90);

  let resCount = 0;
  let transCount = 0;

  for (let d = 0; d < 90; d++) {
    const currentDate = new Date(ninetyDaysAgo);
    currentDate.setDate(currentDate.getDate() + d);

    // Reservations: 0-20 per day
    const dailyResCount = Math.floor(Math.random() * 21);
    const dailyReservations = [];
    
    for (let i = 0; i < dailyResCount; i++) {
      const customer = finalCustomers[Math.floor(Math.random() * finalCustomers.length)];
      const departure = finalDepartures[Math.floor(Math.random() * finalDepartures.length)];
      const partySize = Math.floor(Math.random() * 4) + 1;
      
      const resAt = new Date(currentDate);
      resAt.setHours(Math.floor(Math.random() * 12) + 8); // 8 AM to 8 PM

      dailyReservations.push({
        org_id: orgId,
        customer_id: customer.id,
        customer_name: customer.full_name,
        customer_phone: customer.phone,
        departure_id: departure.id,
        party_size: partySize,
        reservation_at: resAt.toISOString(),
        status: 'confirmed',
        total_amount: (departure.package_id ? finalPackages.find(p => p.id === departure.package_id)?.base_price || 1000 : 1000) * partySize,
        source: ['web', 'phone', 'agent', 'walk-in'][Math.floor(Math.random() * 4)]
      });
    }

    if (dailyReservations.length > 0) {
      const { data: insertedRes, error: resErr } = await supabaseAdmin
        .from('reservations')
        .insert(dailyReservations)
        .select();
      
      if (resErr) {
        console.error('Error inserting daily reservations:', resErr);
      } else if (insertedRes) {
        resCount += insertedRes.length;
        // Atomic update for departures
        for (const res of insertedRes) {
          if (res.departure_id && res.status === 'confirmed') {
            await supabaseAdmin.rpc('increment_booked', { 
              row_id: res.departure_id, 
              amount: res.party_size 
            });
            // If RPC doesn't exist, we'll need a fallback or just do it via standard update
            // For now let's try standard update if RPC fails
            const { data: dep } = await supabaseAdmin.from('departures').select('booked, capacity').eq('id', res.departure_id).single();
            if (dep) {
                const newBooked = Math.min(dep.booked + res.party_size, dep.capacity);
                await supabaseAdmin.from('departures').update({ booked: newBooked }).eq('id', res.departure_id);
            }
          }
        }
      }
    }

    // Transactions: 3-25 per day
    const dailyTransCount = Math.floor(Math.random() * 23) + 3;
    const dailyTransactions = [];
    for (let i = 0; i < dailyTransCount; i++) {
      const isRefund = Math.random() < 0.1;
      const amount = (Math.random() * 1000 + 100) * (isRefund ? -1 : 1);
      const transAt = new Date(currentDate);
      transAt.setHours(Math.floor(Math.random() * 14) + 7); // 7 AM to 9 PM

      dailyTransactions.push({
        org_id: orgId,
        amount: parseFloat(amount.toFixed(2)),
        type: isRefund ? 'refund' : 'payment',
        note: isRefund ? 'Customer refund' : 'Booking payment',
        occurred_at: transAt.toISOString(),
      });
    }

    const { data: insertedTrans, error: transErr } = await supabaseAdmin
      .from('transactions')
      .insert(dailyTransactions)
      .select();
    
    if (transErr) console.error('Error inserting transactions:', transErr);
    if (insertedTrans) transCount += insertedTrans.length;
  }

  console.log(`✅ Reservations generated: ${resCount}`);
  console.log(`✅ Transactions generated: ${transCount}`);
  console.log('✨ Seeding complete!');
}

seed().catch(err => {
  console.error('💥 Fatal seeding error:', err);
  process.exit(1);
});
