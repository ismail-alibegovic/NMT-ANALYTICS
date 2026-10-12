import { supabaseAdmin } from '../lib/supabase';

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
    }).select('id').single();
    if (departure.error) throw departure.error;
    departureId = departure.data.id;
  }

  const { data: customer, error: customerError } = await supabaseAdmin.from('customers').upsert({
    org_id: ORG_A, full_name: 'Pilot Passenger', phone: '+38761000001',
    email: 'passenger@pilot-a.test', status: 'active',
  }, { onConflict: 'org_id,phone' }).select('id').single();
  if (customerError) throw customerError;

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
  }, null, 2));
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
