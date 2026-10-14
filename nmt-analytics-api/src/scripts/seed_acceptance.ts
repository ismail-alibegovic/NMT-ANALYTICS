import { supabaseAdmin } from '../lib/supabase';
import { createReservationSchema } from '../routes/reservations';
import { saleRequestFingerprint } from '../lib/saleIdempotency';

const LOCAL_URL_PATTERN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
const PASSWORD = process.env.E2E_SEED_PASSWORD || 'TravlinePilot!2026-local';
const ORG_A = '00000000-0000-4000-8000-0000000000a1';
const ORG_B = '00000000-0000-4000-8000-0000000000b1';

type SeedUser = { email: string; role: 'manager' | 'agent'; orgId: string; fullName: string };

function assertLocalOnly() {
  const url = process.env.TRAVLINE_SUPABASE_URL;
  if (!url || !LOCAL_URL_PATTERN.test(url)) {
    throw new Error('Acceptance seed refuses non-local TRAVLINE_SUPABASE_URL values.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Acceptance seed refuses NODE_ENV=production.');
  }
}

async function ensureUser(user: SeedUser) {
  const listed = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  let authUser = listed.data.users.find((candidate) => candidate.email === user.email);
  if (!authUser) {
    const created = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw created.error || new Error(`Could not create ${user.email}`);
    authUser = created.data.user;
  } else {
    const updated = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (updated.error) throw updated.error;
  }

  const { error } = await supabaseAdmin.from('profiles').upsert({
    id: authUser.id,
    org_id: user.orgId,
    role: user.role,
    email: user.email,
    full_name: user.fullName,
  }, { onConflict: 'id' });
  if (error) throw error;
  return authUser.id;
}

async function ensureOrg(id: string, name: string, slug: string) {
  const { error } = await supabaseAdmin.from('organizations').upsert({
    id, name, slug, currency: 'BAM', timezone: 'Europe/Sarajevo',
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function seed() {
  assertLocalOnly();
  // The application uploads documents to this private bucket. Schema replay
  // alone does not provision Storage buckets in a fresh disposable stack.
  const buckets = await supabaseAdmin.storage.listBuckets();
  if (buckets.error) throw buckets.error;
  const documentsBucket = buckets.data.find((bucket) => bucket.id === 'documents');
  if (!documentsBucket) {
    const created = await supabaseAdmin.storage.createBucket('documents', { public: false });
    if (created.error) throw created.error;
  } else if (documentsBucket.public) {
    throw new Error('Acceptance documents bucket must be private.');
  }
  await ensureOrg(ORG_A, 'Pilot A Travel', 'pilot-a-travel');
  await ensureOrg(ORG_B, 'Pilot B Travel', 'pilot-b-travel');

  const managerId = await ensureUser({
    email: 'manager@pilot-a.test', role: 'manager', orgId: ORG_A, fullName: 'Pilot A Manager',
  });
  const staffId = await ensureUser({
    email: 'staff@pilot-a.test', role: 'agent', orgId: ORG_A, fullName: 'Pilot A Staff',
  });
  const otherTenantId = await ensureUser({
    email: 'manager@pilot-b.test', role: 'manager', orgId: ORG_B, fullName: 'Pilot B Manager',
  });

  const { data: existingPackage, error: packageLookupError } = await supabaseAdmin
    .from('packages').select('id').eq('org_id', ORG_A).eq('name', 'BAM Sarajevo Bus Pilot').maybeSingle();
  if (packageLookupError) throw packageLookupError;

  let packageId = existingPackage?.id;
  if (!packageId) {
    const created = await supabaseAdmin.from('packages').insert({
      org_id: ORG_A, name: 'BAM Sarajevo Bus Pilot', destination: 'Sarajevo–Mostar',
      base_price: 180, currency: 'BAM', duration_days: 2, max_participants: 30, is_active: true,
    }).select('id').single();
    if (created.error) throw created.error;
    packageId = created.data.id;
  }

  const { data: existingDeparture, error: departureLookupError } = await supabaseAdmin
    .from('departures').select('id').eq('org_id', ORG_A).eq('package_id', packageId)
    .eq('status', 'active').maybeSingle();
  if (departureLookupError) throw departureLookupError;

  let departureId = existingDeparture?.id;
  if (!departureId) {
    const departure = await supabaseAdmin.from('departures').insert({
      org_id: ORG_A, package_id: packageId, depart_at: '2027-05-15T07:00:00+02:00',
      return_at: '2027-05-16T20:00:00+02:00', capacity: 30, booked: 0, status: 'active',
      transport_type: 'bus',
    }).select('id').single();
    if (departure.error) throw departure.error;
    departureId = departure.data.id;
  }

  const { error: departureTypeError } = await supabaseAdmin
    .from('departures')
    .update({ transport_type: 'bus' })
    .eq('id', departureId)
    .eq('org_id', ORG_A);
  if (departureTypeError) throw departureTypeError;

  const { error: vehicleError } = await supabaseAdmin.rpc('update_vehicle_atomic', {
    p_org_id: ORG_A,
    p_departure_id: departureId,
    p_vehicle_label: 'Pilot Acceptance Bus',
    p_registration_number: null,
    p_capacity: 30,
    p_layout_type: 'standard_2_plus_2',
  });
  if (vehicleError) throw vehicleError;

  const { data: existingHotel, error: hotelLookupError } = await supabaseAdmin
    .from('hotels')
    .select('id')
    .eq('org_id', ORG_A)
    .eq('name', 'Pilot BAM Hotel')
    .maybeSingle();
  if (hotelLookupError) throw hotelLookupError;

  let hotelId = existingHotel?.id;
  if (!hotelId) {
    const hotel = await supabaseAdmin.from('hotels').insert({
      org_id: ORG_A,
      name: 'Pilot BAM Hotel',
      destination: 'Mostar',
      total_rooms: 10,
      slug: `pilot-bam-hotel-${Date.now()}`,
    }).select('id').single();
    if (hotel.error) throw hotel.error;
    hotelId = hotel.data.id;
  }

  const { data: existingPackageHotel, error: packageHotelLookupError } = await supabaseAdmin
    .from('package_hotels')
    .select('id')
    .eq('org_id', ORG_A)
    .eq('package_id', packageId)
    .eq('hotel_id', hotelId)
    .maybeSingle();
  if (packageHotelLookupError) throw packageHotelLookupError;

  let packageHotelId = existingPackageHotel?.id;
  if (!packageHotelId) {
    const packageHotel = await supabaseAdmin.from('package_hotels').insert({
      org_id: ORG_A,
      package_id: packageId,
      hotel_id: hotelId,
      room_options: [{ type: 'double', label: 'Double', available: 10, net_price: 70, sell_price: 90 }],
      sort_order: 1,
    }).select('id').single();
    if (packageHotel.error) throw packageHotel.error;
    packageHotelId = packageHotel.data.id;
  }

  const { data: existingAllocation, error: allocationLookupError } = await supabaseAdmin
    .from('hotel_allocations')
    .select('id')
    .eq('org_id', ORG_A)
    .eq('departure_id', departureId)
    .eq('hotel_id', hotelId)
    .eq('room_type', 'double')
    .maybeSingle();
  if (allocationLookupError) throw allocationLookupError;

  let hotelAllocationId = existingAllocation?.id;
  if (!hotelAllocationId) {
    const allocation = await supabaseAdmin.from('hotel_allocations').insert({
      org_id: ORG_A,
      departure_id: departureId,
      hotel_id: hotelId,
      package_hotel_id: packageHotelId,
      source_room_option_index: 0,
      room_type: 'double',
      room_label: 'Double',
      rooms_reserved: 10,
      template_rooms: 10,
      capacity_per_room: 2,
      check_in: '2027-05-15',
      check_out: '2027-05-16',
      price_per_night: 90,
      net_price: 70,
      sell_price: 90,
      sort_order: 1,
    }).select('id').single();
    if (allocation.error) throw allocation.error;
    hotelAllocationId = allocation.data.id;
  }

  const { error: slotSyncError } = await supabaseAdmin.rpc('sync_departure_room_slots_atomic', {
    p_org_id: ORG_A,
    p_departure_id: departureId,
    p_hotel_allocation_id: hotelAllocationId,
  });
  if (slotSyncError) throw slotSyncError;

  const { data: customer, error: customerError } = await supabaseAdmin.from('customers').upsert({
    org_id: ORG_A, full_name: 'Pilot Passenger', phone: '+38761000001',
    email: 'passenger@pilot-a.test', status: 'active',
  }, { onConflict: 'org_id,phone' }).select('id').single();
  if (customerError) throw customerError;

  const recoveryKey = 'acceptance-recovery-installments';
  const recoveryPayload = createReservationSchema.parse({
    departureId, customerId: customer.id, customerName: 'Recovered Pilot Customer', customerPhone: '+38761000003',
    partySize: 1, reservationAt: new Date().toISOString(), status: 'pending', totalAmount: 180, currency: 'BAM', source: 'agent',
    passengers: [{ full_name: 'Recovered Pilot Passenger' }], installmentCount: 2,
  });
  const existingRecovery = await supabaseAdmin.from('reservations').select('id')
    .eq('org_id', ORG_A).eq('creation_idempotency_key', recoveryKey).maybeSingle();
  if (existingRecovery.error) throw existingRecovery.error;
  let recoveryReservationId = existingRecovery.data?.id;
  if (!recoveryReservationId) {
    const recovery = await supabaseAdmin.from('reservations').insert({
      org_id: ORG_A, departure_id: departureId, customer_id: customer.id,
      customer_name: recoveryPayload.customerName, customer_phone: recoveryPayload.customerPhone,
      party_size: 1, reservation_at: recoveryPayload.reservationAt, status: 'pending',
      total_amount: 180, currency: 'BAM', source: 'agent',
      creation_idempotency_key: recoveryKey, creation_fingerprint: saleRequestFingerprint(recoveryPayload as Record<string, unknown>),
      creation_state: 'recovery_required', creation_error_stage: 'installments',
    }).select('id').single();
    if (recovery.error) throw recovery.error;
    recoveryReservationId = recovery.data.id;
    const passenger = await supabaseAdmin.from('departure_passengers').insert({
      org_id: ORG_A, departure_id: departureId, reservation_id: recoveryReservationId, full_name: 'Recovered Pilot Passenger',
    });
    if (passenger.error) throw passenger.error;
  }

  console.log(JSON.stringify({
    password: PASSWORD,
    managerId,
    staffId,
    otherTenantId,
    orgA: ORG_A,
    orgB: ORG_B,
    packageId,
    departureId,
    customerId: customer.id,
    hotelAllocationId,
    recoveryReservationId,
  }, null, 2));
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
