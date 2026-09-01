import 'dotenv/config';
import { supabaseAdmin } from '../lib/supabase';
import { materializeDepartureAccommodationFromPackage, syncDepartureRoomSlots } from '../lib/departureAccommodation';
import { replaceReservationAccommodation } from '../lib/reservationAccommodation';

const SEED_ID = 'travline_golden_demo_2027';
const DEMO_RESET_CONFIRMATION_VALUE = 'YES_RESET_DEMO_DATA';
const DEMO_TARGET_ORG_ID_ENV = 'DEMO_TARGET_ORG_ID';
const DEMO_RESET_CONFIRMATION_ENV = 'DEMO_RESET_CONFIRMATION';
const LEGACY_DEMO_ORG_SLUG = 'travline-demo-2027';
const LEGACY_DEMO_ORG_NAME = 'Travline Demo Agency 2027';
const DEMO_CUSTOMER_EMAIL_SUFFIX = '.demo@example.com';
const DEMO_FLIGHT_NOTE = 'Demo flight number; not a real scheduled commercial flight.';
const ADMIN_EMAIL = 'admin@demo.com';
const SEED_USER_ID = process.env.SEED_USER_ID || null;

type RoomOption = {
  type: string;
  label: string;
  available: number;
  net_price: number;
  sell_price: number;
};

type DemoPackage = {
  key: string;
  name: string;
  destination: string;
  transportType: 'flight' | 'bus';
  basePrice: number;
  durationDays: number;
  hotel: { name: string; destination: string; stars: number };
  rooms: RoomOption[];
  departure: { departAt: string; returnAt: string; overrides?: Record<string, number> };
  flights?: { outbound: FlightSeed; inbound: FlightSeed };
  reservations: ReservationSeed[];
};

type FlightSeed = {
  airline: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  arrivalTime: string;
};

type ReservationSeed = {
  customerName: string;
  phone: string;
  email: string;
  status: 'pending' | 'confirmed';
  paidFraction: number;
  passengers: string[];
  groupName?: string;
  passport?: boolean;
  accommodationRequirements?: {
    roomType: string;
    roomCount: number;
    passengerNames: string[];
    notes?: string;
  }[];
  roomType?: string;
  roomCount?: number;
};

const packages: DemoPackage[] = [
  {
    key: 'antalya',
    name: 'Antalya Summer 2027',
    destination: 'Antalya, Türkiye',
    transportType: 'flight',
    basePrice: 990,
    durationDays: 8,
    hotel: { name: 'Hotel Azure Antalya', destination: 'Antalya, Türkiye', stars: 5 },
    rooms: [
      { type: 'single', label: 'Single', available: 4, net_price: 450, sell_price: 590 },
      { type: 'double', label: 'Double', available: 18, net_price: 650, sell_price: 790 },
      { type: 'triple', label: 'Triple', available: 8, net_price: 820, sell_price: 990 },
      { type: 'suite', label: 'Suite', available: 2, net_price: 1100, sell_price: 1390 },
    ],
    departure: {
      departAt: '2027-06-10T08:00:00.000Z',
      returnAt: '2027-06-17T18:00:00.000Z',
      overrides: { single: 4, double: 16, triple: 7, suite: 2 },
    },
    flights: {
      outbound: { airline: 'Demo Pegasus', flightNumber: 'PC-D101', departureAirport: 'SJJ', arrivalAirport: 'AYT', departureTime: '2027-06-10T08:00:00.000Z', arrivalTime: '2027-06-10T11:20:00.000Z' },
      inbound: { airline: 'Demo Pegasus', flightNumber: 'PC-D102', departureAirport: 'AYT', arrivalAirport: 'SJJ', departureTime: '2027-06-17T15:00:00.000Z', arrivalTime: '2027-06-17T16:30:00.000Z' },
    },
    reservations: [
      { customerName: 'Amina Hadžić', phone: '+38761100001', email: 'amina.hadzic.demo@example.com', status: 'confirmed', paidFraction: 1, roomType: 'double', roomCount: 1, groupName: 'Porodica Hadžić', passengers: ['Amina Hadžić', 'Emir Hadžić'], passport: true },
      { customerName: 'Sara Begić', phone: '+38761100002', email: 'sara.begic.demo@example.com', status: 'confirmed', paidFraction: 0.5, roomType: 'triple', roomCount: 1, passengers: ['Sara Begić', 'Lejla Begić', 'Hana Begić'], passport: true },
      {
        customerName: 'Ahmed Alić',
        phone: '+38761100003',
        email: 'ahmed.alic.demo@example.com',
        status: 'pending',
        paidFraction: 0,
        groupName: 'Društvo Alić',
        passengers: ['Ahmed Alić', 'Kenan Alić', 'Faruk Alić', 'Nedim Alić'],
        passport: true,
        accommodationRequirements: [
          { roomType: 'double', roomCount: 1, passengerNames: ['Ahmed Alić', 'Kenan Alić'], notes: 'Društvo Alić zajedno u double' },
          { roomType: 'single', roomCount: 2, passengerNames: ['Faruk Alić', 'Nedim Alić'], notes: 'Društvo Alić dva singla u jednom redu' },
        ],
      },
      { customerName: 'Maja Kovačević', phone: '+38761100004', email: 'maja.kovacevic.demo@example.com', status: 'confirmed', paidFraction: 0.3, roomType: 'single', roomCount: 1, passengers: ['Maja Kovačević'], passport: true },
      { customerName: 'Tarik Softić', phone: '+38761100005', email: 'tarik.softic.demo@example.com', status: 'confirmed', paidFraction: 0, roomType: 'double', roomCount: 1, passengers: ['Tarik Softić', 'Lamija Softić'], passport: true },
    ],
  },
  {
    key: 'istanbul',
    name: 'Istanbul City Break',
    destination: 'Istanbul, Türkiye',
    transportType: 'flight',
    basePrice: 690,
    durationDays: 5,
    hotel: { name: 'Golden Bosphorus Hotel', destination: 'Istanbul, Türkiye', stars: 4 },
    rooms: [
      { type: 'single', label: 'Single', available: 5, net_price: 310, sell_price: 430 },
      { type: 'double', label: 'Double', available: 12, net_price: 470, sell_price: 620 },
      { type: 'triple', label: 'Triple', available: 5, net_price: 610, sell_price: 790 },
    ],
    departure: { departAt: '2027-09-18T07:00:00.000Z', returnAt: '2027-09-22T19:00:00.000Z' },
    flights: {
      outbound: { airline: 'Demo Turkish', flightNumber: 'TK-D201', departureAirport: 'SJJ', arrivalAirport: 'IST', departureTime: '2027-09-18T07:00:00.000Z', arrivalTime: '2027-09-18T09:00:00.000Z' },
      inbound: { airline: 'Demo Turkish', flightNumber: 'TK-D202', departureAirport: 'IST', arrivalAirport: 'SJJ', departureTime: '2027-09-22T17:00:00.000Z', arrivalTime: '2027-09-22T18:55:00.000Z' },
    },
    reservations: [
      { customerName: 'Mirza Pašić', phone: '+38761200001', email: 'mirza.pasic.demo@example.com', status: 'confirmed', paidFraction: 1, roomType: 'double', roomCount: 1, passengers: ['Mirza Pašić', 'Ajla Pašić'], passport: true },
      { customerName: 'Selma Delić', phone: '+38761200002', email: 'selma.delic.demo@example.com', status: 'confirmed', paidFraction: 0.5, roomType: 'triple', roomCount: 1, passengers: ['Selma Delić', 'Una Delić', 'Dino Delić'], passport: true },
      { customerName: 'Haris Babić', phone: '+38761200003', email: 'haris.babic.demo@example.com', status: 'pending', paidFraction: 0, roomType: 'single', roomCount: 1, passengers: ['Haris Babić'], passport: true },
      { customerName: 'Nejra Mujić', phone: '+38761200004', email: 'nejra.mujic.demo@example.com', status: 'confirmed', paidFraction: 0.3, roomType: 'double', roomCount: 1, passengers: ['Nejra Mujić', 'Emina Mujić'], passport: true },
    ],
  },
  {
    key: 'dubai',
    name: 'Dubai Escape',
    destination: 'Dubai, UAE',
    transportType: 'flight',
    basePrice: 1590,
    durationDays: 6,
    hotel: { name: 'Marina Vista Dubai', destination: 'Dubai, UAE', stars: 5 },
    rooms: [
      { type: 'single', label: 'Single', available: 3, net_price: 700, sell_price: 890 },
      { type: 'double', label: 'Double', available: 10, net_price: 980, sell_price: 1240 },
      { type: 'triple', label: 'Triple', available: 4, net_price: 1280, sell_price: 1550 },
      { type: 'suite', label: 'Suite', available: 3, net_price: 1650, sell_price: 1990 },
    ],
    departure: { departAt: '2027-11-05T09:30:00.000Z', returnAt: '2027-11-10T22:00:00.000Z' },
    flights: {
      outbound: { airline: 'Demo FlyDubai', flightNumber: 'FZ-D301', departureAirport: 'SJJ', arrivalAirport: 'DXB', departureTime: '2027-11-05T09:30:00.000Z', arrivalTime: '2027-11-05T15:40:00.000Z' },
      inbound: { airline: 'Demo FlyDubai', flightNumber: 'FZ-D302', departureAirport: 'DXB', arrivalAirport: 'SJJ', departureTime: '2027-11-10T17:15:00.000Z', arrivalTime: '2027-11-10T21:20:00.000Z' },
    },
    reservations: [
      { customerName: 'Adnan Šabanović', phone: '+38761300001', email: 'adnan.sabanovic.demo@example.com', status: 'confirmed', paidFraction: 0.5, roomType: 'double', roomCount: 1, passengers: ['Adnan Šabanović', 'Belma Šabanović'], passport: true },
      { customerName: 'Lejla Tahirović', phone: '+38761300002', email: 'lejla.tahirovic.demo@example.com', status: 'confirmed', paidFraction: 1, roomType: 'suite', roomCount: 1, passengers: ['Lejla Tahirović', 'Dženan Tahirović'], passport: true },
      { customerName: 'Bakir Osmanović', phone: '+38761300003', email: 'bakir.osmanovic.demo@example.com', status: 'pending', paidFraction: 0, roomType: 'triple', roomCount: 1, passengers: ['Bakir Osmanović', 'Aida Osmanović', 'Vedad Osmanović'], passport: true },
    ],
  },
  {
    key: 'budva',
    name: 'Budva Summer',
    destination: 'Budva, Montenegro',
    transportType: 'bus',
    basePrice: 590,
    durationDays: 8,
    hotel: { name: 'Adriatic Pearl Budva', destination: 'Budva, Montenegro', stars: 4 },
    rooms: [
      { type: 'single', label: 'Single', available: 4, net_price: 260, sell_price: 340 },
      { type: 'double', label: 'Double', available: 15, net_price: 390, sell_price: 520 },
      { type: 'triple', label: 'Triple', available: 8, net_price: 510, sell_price: 660 },
      { type: 'apartment', label: 'Apartment', available: 4, net_price: 720, sell_price: 900 },
    ],
    departure: { departAt: '2027-07-12T06:00:00.000Z', returnAt: '2027-07-19T20:00:00.000Z' },
    reservations: [
      { customerName: 'Dženita Kurt', phone: '+38761400001', email: 'dzenita.kurt.demo@example.com', status: 'confirmed', paidFraction: 0.5, roomType: 'apartment', roomCount: 1, groupName: 'Kurt društvo', passengers: ['Dženita Kurt', 'Mirsad Kurt', 'Sara Kurt', 'Emir Kurt'] },
      { customerName: 'Amar Hodžić', phone: '+38761400002', email: 'amar.hodzic.demo@example.com', status: 'confirmed', paidFraction: 1, roomType: 'triple', roomCount: 1, passengers: ['Amar Hodžić', 'Tarik Hodžić', 'Hana Hodžić'] },
      { customerName: 'Lamija Smajić', phone: '+38761400003', email: 'lamija.smajic.demo@example.com', status: 'pending', paidFraction: 0, roomType: 'double', roomCount: 2, groupName: 'Smajić ekipa', passengers: ['Lamija Smajić', 'Ajla Smajić', 'Kenan Smajić', 'Faruk Smajić'] },
      { customerName: 'Mirsad Alić', phone: '+38761400004', email: 'mirsad.alic.demo@example.com', status: 'confirmed', paidFraction: 0.3, roomType: 'double', roomCount: 1, passengers: ['Mirsad Alić', 'Selma Alić'] },
    ],
  },
  {
    key: 'mostar',
    name: 'Mostar & Herzegovina Experience',
    destination: 'Mostar, Bosnia and Herzegovina',
    transportType: 'bus',
    basePrice: 390,
    durationDays: 4,
    hotel: { name: 'Neretva Heritage Hotel', destination: 'Mostar, Bosnia and Herzegovina', stars: 4 },
    rooms: [
      { type: 'single', label: 'Single', available: 3, net_price: 160, sell_price: 220 },
      { type: 'double', label: 'Double', available: 10, net_price: 240, sell_price: 330 },
      { type: 'triple', label: 'Triple', available: 5, net_price: 330, sell_price: 450 },
    ],
    departure: { departAt: '2027-05-03T08:00:00.000Z', returnAt: '2027-05-06T19:00:00.000Z' },
    reservations: [
      { customerName: 'Emina Spahić', phone: '+38761500001', email: 'emina.spahic.demo@example.com', status: 'confirmed', paidFraction: 1, roomType: 'single', roomCount: 1, passengers: ['Emina Spahić'] },
      { customerName: 'Vedad Mešić', phone: '+38761500002', email: 'vedad.mesic.demo@example.com', status: 'confirmed', paidFraction: 0.5, roomType: 'double', roomCount: 1, passengers: ['Vedad Mešić', 'Nejra Mešić'] },
      { customerName: 'Aldin Hukić', phone: '+38761500003', email: 'aldin.hukic.demo@example.com', status: 'pending', paidFraction: 0, roomType: 'triple', roomCount: 1, groupName: 'Hukić društvo', passengers: ['Aldin Hukić', 'Maja Hukić', 'Dino Hukić'] },
      { customerName: 'Belma Sirčo', phone: '+38761500004', email: 'belma.sirco.demo@example.com', status: 'confirmed', paidFraction: 0.3, roomType: 'double', roomCount: 1, passengers: ['Belma Sirčo', 'Nedim Sirčo'] },
    ],
  },
];

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function failOnError(label: string, result: { error?: any }) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message || JSON.stringify(result.error)}`);
  }
}

type SeedOwnedRecordIds = {
  packages: string[];
  hotels: string[];
  flights: string[];
  customers: string[];
  reservations: string[];
  trip_passenger_groups: string[];
  departures: string[];
  package_hotels: string[];
  hotel_allocations: string[];
  departure_room_slots: string[];
  departure_room_slot_assignments: string[];
  reservation_accommodation_requirements: string[];
  departure_passengers: string[];
  payments: string[];
  transactions: string[];
  departure_flights: string[];
  trip_passenger_group_members: string[];
};

function uniqueIds(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

async function loadSeedRegistryIds(orgId: string): Promise<Record<string, string[]>> {
  const { data, error } = await supabaseAdmin
    .from('seed_owned_records')
    .select('entity, record_id')
    .eq('org_id', orgId)
    .eq('seed_id', SEED_ID);
  if (error) throw new Error(`load golden seed ownership registry: ${error.message}`);
  const ids: Record<string, string[]> = {};
  for (const row of data || []) {
    ids[row.entity] = uniqueIds([...(ids[row.entity] || []), row.record_id]);
  }
  return ids;
}

const goldenSeedRecordIds: { entity: string; recordId: string }[] = [];

async function registerSeedRecord(orgId: string, entity: string, recordId: string) {
  const { error } = await supabaseAdmin
    .from('seed_owned_records')
    .upsert(
      { org_id: orgId, seed_id: SEED_ID, entity, record_id: recordId },
      { onConflict: 'org_id,seed_id,entity,record_id' },
    );
  if (error) throw new Error(`register golden seed record (${entity}): ${error.message}`);
}

async function resolveGoldenDemoTargetOrg() {
  const targetOrgId = (process.env[DEMO_TARGET_ORG_ID_ENV] || '').trim();
  const resetConfirmation = (process.env[DEMO_RESET_CONFIRMATION_ENV] || '').trim();

  if (!targetOrgId) {
    throw new Error(`${DEMO_TARGET_ORG_ID_ENV} is required. The golden demo seed never auto-selects NMT Analytics, the first organization, or the current profile organization. Set ${DEMO_TARGET_ORG_ID_ENV} to the exact organization UUID that should own the golden demo dataset.`);
  }
  if (resetConfirmation !== DEMO_RESET_CONFIRMATION_VALUE) {
    throw new Error(`${DEMO_RESET_CONFIRMATION_ENV} must be set to ${DEMO_RESET_CONFIRMATION_VALUE} before the seed may reset seed-owned demo records.`);
  }

  const { data: org, error } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug, currency, timezone')
    .eq('id', targetOrgId)
    .maybeSingle();
  if (error) throw error;
  if (!org) {
    throw new Error(`${DEMO_TARGET_ORG_ID_ENV} ${targetOrgId} does not reference an existing organization. Refusing to run the golden demo seed against an unknown organization.`);
  }

  console.log('Golden demo seed target organization (printed before any mutation):');
  console.log(`  id:   ${org.id}`);
  console.log(`  name: ${org.name}`);
  console.log(`  slug: ${org.slug}`);
  console.log(`  seed: ${SEED_ID}`);

  const isLegacyDemoOrg =
    org.slug === LEGACY_DEMO_ORG_SLUG &&
    org.name === LEGACY_DEMO_ORG_NAME &&
    org.currency === 'BAM' &&
    org.timezone === 'Europe/Sarajevo';

  return { orgId: org.id, isLegacyDemoOrg };
}

async function resolveSeedOwnedRecordIds(orgId: string, isLegacyDemoOrg: boolean): Promise<SeedOwnedRecordIds> {
  const registryIds = await loadSeedRegistryIds(orgId);
  const ids: SeedOwnedRecordIds = {
    packages: uniqueIds(registryIds.packages),
    hotels: uniqueIds(registryIds.hotels),
    flights: uniqueIds(registryIds.flights),
    customers: uniqueIds(registryIds.customers),
    reservations: uniqueIds(registryIds.reservations),
    trip_passenger_groups: uniqueIds(registryIds.trip_passenger_groups),
    departures: [],
    package_hotels: [],
    hotel_allocations: [],
    departure_room_slots: [],
    departure_room_slot_assignments: [],
    reservation_accommodation_requirements: [],
    departure_passengers: [],
    payments: [],
    transactions: [],
    departure_flights: [],
    trip_passenger_group_members: [],
  };

  if (isLegacyDemoOrg) {
    // The legacy demo organization was created and fully owned by previous versions of
    // this seed (exact identity match on slug/name/currency/timezone). Its seed records
    // carry deterministic markers written by those seed versions; no fuzzy name matching.
    const legacyCustomers = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('org_id', orgId)
      .like('email', `%${DEMO_CUSTOMER_EMAIL_SUFFIX}`);
    if (legacyCustomers.error) throw legacyCustomers.error;
    ids.customers = uniqueIds([...ids.customers, ...(legacyCustomers.data || []).map((row: any) => row.id)]);

    const legacyPackages = await supabaseAdmin
      .from('packages')
      .select('id')
      .eq('org_id', orgId)
      .in('name', packages.map((spec) => spec.name));
    if (legacyPackages.error) throw legacyPackages.error;
    ids.packages = uniqueIds([...ids.packages, ...(legacyPackages.data || []).map((row: any) => row.id)]);

    const legacyHotels = await supabaseAdmin
      .from('hotels')
      .select('id')
      .eq('org_id', orgId)
      .in('name', packages.map((spec) => spec.hotel.name));
    if (legacyHotels.error) throw legacyHotels.error;
    ids.hotels = uniqueIds([...ids.hotels, ...(legacyHotels.data || []).map((row) => row.id)]);

    const legacyFlights = await supabaseAdmin
      .from('flights')
      .select('id')
      .eq('org_id', orgId)
      .eq('notes', DEMO_FLIGHT_NOTE);
    if (legacyFlights.error) throw legacyFlights.error;
    ids.flights = uniqueIds([...ids.flights, ...(legacyFlights.data || []).map((row) => row.id)]);
  }

  const collectIds = async (table: string, column: string, rootIds: string[]) => {
    if (rootIds.length === 0) return [] as string[];
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('id')
      .eq('org_id', orgId)
      .in(column, rootIds);
    if (error) throw new Error(`resolve seed-owned ${table}: ${error.message}`);
    return (data || []).map((row: any) => row.id as string);
  };

  ids.departures = uniqueIds([...ids.departures, ...(await collectIds('departures', 'package_id', ids.packages))]);
  ids.package_hotels = uniqueIds([...ids.package_hotels, ...(await collectIds('package_hotels', 'package_id', ids.packages))]);
  ids.hotel_allocations = uniqueIds([...ids.hotel_allocations, ...(await collectIds('hotel_allocations', 'departure_id', ids.departures))]);
  ids.departure_room_slots = uniqueIds([...ids.departure_room_slots, ...(await collectIds('departure_room_slots', 'departure_id', ids.departures))]);
  ids.departure_flights = uniqueIds([...ids.departure_flights, ...(await collectIds('departure_flights', 'departure_id', ids.departures))]);
  ids.reservations = uniqueIds([...ids.reservations, ...(await collectIds('reservations', 'customer_id', ids.customers))]);
  ids.departure_passengers = uniqueIds([...ids.departure_passengers, ...(await collectIds('departure_passengers', 'reservation_id', ids.reservations))]);
  ids.reservation_accommodation_requirements = uniqueIds([...ids.reservation_accommodation_requirements, ...(await collectIds('reservation_accommodation_requirements', 'reservation_id', ids.reservations))]);
  ids.payments = uniqueIds([...ids.payments, ...(await collectIds('payments', 'reservation_id', ids.reservations))]);
  ids.transactions = uniqueIds([...ids.transactions, ...(await collectIds('transactions', 'reservation_id', ids.reservations))]);
  ids.trip_passenger_groups = uniqueIds([...ids.trip_passenger_groups, ...(await collectIds('trip_passenger_groups', 'departure_id', ids.departures))]);
  ids.trip_passenger_group_members = uniqueIds([...ids.trip_passenger_group_members, ...(await collectIds('trip_passenger_group_members', 'group_id', ids.trip_passenger_groups))]);

  const assignmentIds = await collectIds('departure_room_slot_assignments', 'room_slot_id', ids.departure_room_slots);
  const assignmentIdsByPassenger = await collectIds('departure_room_slot_assignments', 'passenger_id', ids.departure_passengers);
  ids.departure_room_slot_assignments = uniqueIds([...ids.departure_room_slot_assignments, ...assignmentIds, ...assignmentIdsByPassenger]);

  return ids;
}

async function assertNoForeignSeedDependents(orgId: string, owned: SeedOwnedRecordIds) {
  const findForeignIds = async (table: string, match: { column: string; values: string[] }, exclude: { column: string; values: string[] }) => {
    if (match.values.length === 0) return [] as string[];
    let query = supabaseAdmin.from(table).select('id').eq('org_id', orgId).in(match.column, match.values);
    if (exclude.values.length > 0) {
      query = query.not(exclude.column, 'in', `(${exclude.values.join(',')})`);
    }
    const { data, error } = await query;
    if (error) throw new Error(`check foreign dependents in ${table}: ${error.message}`);
    return (data || []).map((row: any) => row.id as string);
  };

  const refuse = (reason: string, found: string[]) => {
    const preview = found.slice(0, 5).join(', ');
    throw new Error(
      `Golden demo seed refused to reset seed-owned records: ${reason} ` +
      `Affected ids: ${preview}${found.length > 5 ? ` (+${found.length - 5} more)` : ''}. ` +
      'Move or remove these non-seed records manually, then rerun the seed.',
    );
  };

  const foreignDepartures = await findForeignIds('departures', { column: 'package_id', values: owned.packages }, { column: 'id', values: owned.departures });
  if (foreignDepartures.length > 0) refuse('user-created departures reference seed-owned packages.', foreignDepartures);

  const foreignReservationsOnDepartures = await findForeignIds('reservations', { column: 'departure_id', values: owned.departures }, { column: 'id', values: owned.reservations });
  if (foreignReservationsOnDepartures.length > 0) refuse('user-created reservations are attached to seed-owned departures.', foreignReservationsOnDepartures);

  const foreignReservationsOnCustomers = await findForeignIds('reservations', { column: 'customer_id', values: owned.customers }, { column: 'id', values: owned.reservations });
  if (foreignReservationsOnCustomers.length > 0) refuse('user-created reservations reference seed-owned customers.', foreignReservationsOnCustomers);

  const foreignAllocations = await findForeignIds('hotel_allocations', { column: 'hotel_id', values: owned.hotels }, { column: 'departure_id', values: owned.departures });
  if (foreignAllocations.length > 0) refuse('user-created accommodation allocations reference seed-owned hotels.', foreignAllocations);

  const foreignRequirements = await findForeignIds('reservation_accommodation_requirements', { column: 'hotel_allocation_id', values: owned.hotel_allocations }, { column: 'reservation_id', values: owned.reservations });
  if (foreignRequirements.length > 0) refuse('user-created accommodation requirements reference seed-owned allotments.', foreignRequirements);

  const foreignDepartureFlights = await findForeignIds('departure_flights', { column: 'flight_id', values: owned.flights }, { column: 'departure_id', values: owned.departures });
  if (foreignDepartureFlights.length > 0) refuse('user-created departure flight links reference seed-owned flights.', foreignDepartureFlights);

  const foreignAssignments = await findForeignIds('departure_room_slot_assignments', { column: 'room_slot_id', values: owned.departure_room_slots }, { column: 'passenger_id', values: owned.departure_passengers });
  if (foreignAssignments.length > 0) refuse('user-created room-slot assignments exist on seed-owned room slots.', foreignAssignments);
}

async function cleanupSeedOwnedRecords(orgId: string, owned: SeedOwnedRecordIds) {
  const deleteIn = async (table: string, column: string, values: string[]) => {
    if (values.length === 0) return;
    const { error } = await supabaseAdmin.from(table).delete().eq('org_id', orgId).in(column, values);
    failOnError(`cleanup seed-owned ${table}`, { error });
  };

  await deleteIn('departure_room_slot_assignments', 'room_slot_id', owned.departure_room_slot_assignments);
  await deleteIn('departure_room_slots', 'departure_id', owned.departure_room_slots);
  await deleteIn('reservation_accommodation_requirements', 'reservation_id', owned.reservation_accommodation_requirements);
  await deleteIn('departure_passengers', 'reservation_id', owned.departure_passengers);
  await deleteIn('payments', 'reservation_id', owned.payments);
  await deleteIn('transactions', 'reservation_id', owned.transactions);
  await deleteIn('trip_passenger_group_members', 'group_id', owned.trip_passenger_group_members);
  await deleteIn('trip_passenger_groups', 'id', owned.trip_passenger_groups);
  await deleteIn('reservations', 'id', owned.reservations);
  await deleteIn('departure_flights', 'departure_id', owned.departure_flights);
  await deleteIn('flights', 'id', owned.flights);
  await deleteIn('hotel_allocations', 'departure_id', owned.hotel_allocations);
  await deleteIn('departures', 'id', owned.departures);
  await deleteIn('package_hotels', 'package_id', owned.package_hotels);
  await deleteIn('packages', 'id', owned.packages);
  await deleteIn('hotels', 'id', owned.hotels);
  await deleteIn('customers', 'id', owned.customers);

  failOnError('cleanup seed-owned records registry', await supabaseAdmin
    .from('seed_owned_records')
    .delete()
    .eq('org_id', orgId)
    .eq('seed_id', SEED_ID));
}
async function associateDemoProfileIfRequested(orgId: string) {
  if (!SEED_USER_ID) {
    console.log('No SEED_USER_ID supplied; demo data will not be linked to a profile or reachable through the authenticated UI.');
    return;
  }

  const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(SEED_USER_ID);
  if (authUserError) throw authUserError;
  if (!authUserData?.user) {
    throw new Error(`SEED_USER_ID ${SEED_USER_ID} must reference an existing Supabase Auth user. Create or sign in the dedicated demo account first, then rerun the seed.`);
  }

  const profile = await supabaseAdmin
    .from('profiles')
    .select('id, email, org_id, role')
    .eq('id', SEED_USER_ID)
    .maybeSingle();
  if (profile.error) throw profile.error;

  if (profile.data?.org_id && profile.data.org_id !== orgId) {
    throw new Error(`SEED_USER_ID ${SEED_USER_ID} belongs to a different organization. Refusing to reassign a real profile to the demo organization.`);
  }

  if (profile.data) {
    console.log(`SEED_USER_ID ${SEED_USER_ID} already belongs to the demo organization; leaving existing profile fields unchanged.`);
    return;
  }

  failOnError('create explicit demo profile', await supabaseAdmin
    .from('profiles')
    .insert({ id: SEED_USER_ID, email: authUserData.user.email || ADMIN_EMAIL, role: 'director', org_id: orgId }));
}

async function seed() {
  console.log('🌱 Seeding deterministic Travline golden demo data...');

  const { orgId, isLegacyDemoOrg } = await resolveGoldenDemoTargetOrg();
  await associateDemoProfileIfRequested(orgId);

  const owned = await resolveSeedOwnedRecordIds(orgId, isLegacyDemoOrg);
  await assertNoForeignSeedDependents(orgId, owned);
  await cleanupSeedOwnedRecords(orgId, owned);

  const seeded: any[] = [];

  for (const spec of packages) {
    const capacity = spec.rooms.reduce((sum, room) => sum + room.available * ({ single: 1, double: 2, triple: 3, apartment: 4, suite: 2, studio: 2 } as Record<string, number>)[room.type], 0);
    const { data: pkg, error: pkgError } = await supabaseAdmin
      .from('packages')
      .insert({
        org_id: orgId,
        name: spec.name,
        destination: spec.destination,
        base_price: spec.basePrice,
        currency: 'BAM',
        duration_days: spec.durationDays,
        max_participants: capacity,
        is_active: true,
        trip_type: spec.transportType === 'flight' ? 'beach' : 'cultural',
        transport_type: spec.transportType,
        transport_capacity: spec.transportType === 'bus' ? 50 : null,
        description: `Demo-safe package for ${spec.destination}.`,
      })
      .select()
      .single();
    if (pkgError) throw pkgError;
    await registerSeedRecord(orgId, 'packages', pkg.id);

    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from('hotels')
      .insert({
        org_id: orgId,
        name: spec.hotel.name,
        destination: spec.hotel.destination,
        stars: spec.hotel.stars,
        total_rooms: spec.rooms.reduce((sum, room) => sum + room.available, 0),
        slug: slugify(spec.hotel.name),
        description: `Demo hotel catalog record for ${spec.hotel.destination}.`,
      })
      .select()
      .single();
    if (hotelError) throw hotelError;
    await registerSeedRecord(orgId, 'hotels', hotel.id);

    const { error: packageHotelError } = await supabaseAdmin
      .from('package_hotels')
      .insert({
        org_id: orgId,
        package_id: pkg.id,
        hotel_id: hotel.id,
        room_options: spec.rooms,
        sort_order: 1,
      });
    if (packageHotelError) throw packageHotelError;

    const { data: departure, error: departureError } = await supabaseAdmin
      .from('departures')
      .insert({
        org_id: orgId,
        package_id: pkg.id,
        depart_at: spec.departure.departAt,
        return_at: spec.departure.returnAt,
        capacity,
        booked: 0,
        status: 'active',
        transport_type: spec.transportType,
      })
      .select()
      .single();
    if (departureError) throw departureError;

    await materializeDepartureAccommodationFromPackage({ orgId, departureId: departure.id, packageId: pkg.id, departAt: spec.departure.departAt, returnAt: spec.departure.returnAt });

    if (spec.departure.overrides) {
      for (const [roomType, roomCount] of Object.entries(spec.departure.overrides)) {
        failOnError(`departure override ${spec.key}/${roomType}`, await supabaseAdmin
          .from('hotel_allocations')
          .update({ rooms_reserved: roomCount })
          .eq('org_id', orgId)
          .eq('departure_id', departure.id)
          .eq('room_type', roomType));
      }
      await syncDepartureRoomSlots(orgId, departure.id);
    }

    if (spec.flights) {
      for (const [direction, flightSpec] of Object.entries(spec.flights)) {
        const { data: flight, error: flightError } = await supabaseAdmin
          .from('flights')
          .insert({
            org_id: orgId,
            airline: flightSpec.airline,
            flight_number: flightSpec.flightNumber,
            departure_airport: flightSpec.departureAirport,
            arrival_airport: flightSpec.arrivalAirport,
            departure_time: flightSpec.departureTime,
            arrival_time: flightSpec.arrivalTime,
            capacity: 180,
            base_price: 0,
            currency: 'BAM',
            notes: DEMO_FLIGHT_NOTE,
            active: true,
          })
          .select()
          .single();
        if (flightError) throw flightError;
        await registerSeedRecord(orgId, 'flights', flight.id);
        failOnError(`departure flight ${spec.key}/${direction}`, await supabaseAdmin.from('departure_flights').insert({
          org_id: orgId,
          departure_id: departure.id,
          flight_id: flight.id,
          direction: direction === 'inbound' ? 'return' : 'outbound',
          segment_order: 0,
        }));
      }
    }

    let booked = 0;
    for (const reservationSpec of spec.reservations) {
      const { data: customer, error: customerError } = await supabaseAdmin
        .from('customers')
        .insert({
          org_id: orgId,
          full_name: reservationSpec.customerName,
          phone: reservationSpec.phone,
          email: reservationSpec.email,
          status: 'active',
        })
        .select()
        .single();
      if (customerError) throw customerError;
      await registerSeedRecord(orgId, 'customers', customer.id);

      const totalAmount = spec.basePrice * reservationSpec.passengers.length;
      const paidAmount = Math.round(totalAmount * reservationSpec.paidFraction);
      const paymentStatus: 'paid' | 'partial' | 'unpaid' = paidAmount >= totalAmount ? 'paid' : (paidAmount > 0 ? 'partial' : 'unpaid');
      const { data: reservation, error: reservationError } = await supabaseAdmin
        .from('reservations')
        .insert({
          org_id: orgId,
          customer_id: customer.id,
          customer_name: reservationSpec.customerName,
          customer_phone: reservationSpec.phone,
          departure_id: departure.id,
          party_size: reservationSpec.passengers.length,
          reservation_at: '2026-08-31T09:00:00.000Z',
          status: reservationSpec.status,
          payment_status: paymentStatus,
          total_amount: totalAmount,
          paid_amount: paidAmount,
          balance_due: totalAmount - paidAmount,
          currency: 'BAM',
          source: 'agent',
        })
        .select()
        .single();
      if (reservationError) throw reservationError;
      await registerSeedRecord(orgId, 'reservations', reservation.id);

      const passengerRows = reservationSpec.passengers.map((name, index) => ({
        org_id: orgId,
        departure_id: departure.id,
        reservation_id: reservation.id,
        full_name: name,
        id_document_type: reservationSpec.passport ? 'passport' : null,
        id_document_number: reservationSpec.passport ? `D${spec.key.toUpperCase().slice(0, 3)}${String(index + 1).padStart(4, '0')}${reservation.id.slice(0, 4)}` : null,
        nationality: 'BIH',
      }));
      const { data: passengerRowsCreated, error: passengerError } = await supabaseAdmin.from('departure_passengers').insert(passengerRows).select();
      if (passengerError) throw passengerError;

      const accommodationRequirements = reservationSpec.accommodationRequirements || (
        reservationSpec.roomType && reservationSpec.roomCount
          ? [{
              roomType: reservationSpec.roomType,
              roomCount: reservationSpec.roomCount,
              passengerNames: reservationSpec.passengers,
              notes: reservationSpec.groupName ? `${reservationSpec.groupName} putuje zajedno` : undefined,
            }]
          : []
      );

      if (accommodationRequirements.length > 0) {
        const passengerIdByName = new Map((passengerRowsCreated || []).map((passenger) => [passenger.full_name, passenger.id]));
        const normalizedRequirements = [];
        for (const requirement of accommodationRequirements) {
          const { data: allocation, error: allocationError } = await supabaseAdmin
            .from('hotel_allocations')
            .select('id')
            .eq('org_id', orgId)
            .eq('departure_id', departure.id)
            .eq('room_type', requirement.roomType)
            .single();
          if (allocationError) throw allocationError;

          normalizedRequirements.push({
            hotelAllocationId: allocation.id,
            roomCount: requirement.roomCount,
            guestsExpected: requirement.passengerNames.length,
            notes: requirement.notes || (reservationSpec.groupName ? `${reservationSpec.groupName} putuje zajedno` : undefined),
            passengerIds: requirement.passengerNames.map((name) => {
              const passengerId = passengerIdByName.get(name);
              if (!passengerId) {
                throw new Error(`Seed passenger mapping missing for ${name} in reservation ${reservation.customer_name}`);
              }
              return passengerId;
            }),
          });
        }

        await replaceReservationAccommodation(reservation.id, orgId, normalizedRequirements);
      }

      if (reservationSpec.groupName && passengerRowsCreated && passengerRowsCreated.length > 1) {
        const { data: group, error: groupError } = await supabaseAdmin
          .from('trip_passenger_groups')
          .insert({
            org_id: orgId,
            departure_id: departure.id,
            name: reservationSpec.groupName,
            color: reservationSpec.groupName.includes('Hadžić') ? '#2563eb' : '#16a34a',
            primary_passenger_name: passengerRowsCreated[0].full_name,
            accommodation_preference: 'prefer_together',
            seating_preference: 'keep_together',
            locked: false,
          })
          .select()
          .single();
        if (groupError) throw groupError;
        await registerSeedRecord(orgId, 'trip_passenger_groups', group.id);
        failOnError(`passenger group members ${reservationSpec.groupName}`, await supabaseAdmin
          .from('trip_passenger_group_members')
          .insert(passengerRowsCreated.map((p) => ({ group_id: group.id, passenger_id: p.id }))));
      }

      if (paidAmount > 0) {
        failOnError(`payment ${reservationSpec.customerName}`, await supabaseAdmin.from('payments').insert({
          org_id: orgId,
          reservation_id: reservation.id,
          amount: paidAmount,
          currency: 'BAM',
          status: 'succeeded',
          payment_date: '2026-08-31',
          payment_method: 'demo',
        }));
      }

      if (reservationSpec.status === 'confirmed') booked += reservationSpec.passengers.length;
    }

    failOnError(`departure booked update ${spec.key}`, await supabaseAdmin.from('departures').update({ booked }).eq('id', departure.id).eq('org_id', orgId));
    seeded.push({ package: pkg, departure });
  }

  const antalya = seeded.find((item) => item.package.name === 'Antalya Summer 2027');
  if (antalya) {
    const { data: slots, error: slotsError } = await supabaseAdmin
      .from('departure_room_slots')
      .select('id, room_type, slot_number, capacity')
      .eq('org_id', orgId)
      .eq('departure_id', antalya.departure.id)
      .in('room_type', ['double', 'triple'])
      .order('room_type')
      .order('slot_number');
    if (slotsError) throw slotsError;
    const { data: passengers, error: passengersError } = await supabaseAdmin
      .from('departure_passengers')
      .select('id, full_name, reservation_id')
      .eq('org_id', orgId)
      .eq('departure_id', antalya.departure.id)
      .order('full_name');
    if (passengersError) throw passengersError;
    const byName = new Map((passengers || []).map((p) => [p.full_name, p]));
    const doubleSlots = (slots || []).filter((s) => s.room_type === 'double');
    const tripleSlots = (slots || []).filter((s) => s.room_type === 'triple');
    const seedAssignments = [
      [doubleSlots[0], byName.get('Amina Hadžić')],
      [doubleSlots[0], byName.get('Emir Hadžić')],
      [doubleSlots[1], byName.get('Tarik Softić')],
      [doubleSlots[1], byName.get('Lamija Softić')],
      [tripleSlots[0], byName.get('Sara Begić')],
      [tripleSlots[0], byName.get('Lejla Begić')],
      [tripleSlots[0], byName.get('Hana Begić')],
    ].filter(([slot, passenger]) => slot && passenger) as any[];

    for (const [slot, passenger] of seedAssignments) {
      failOnError(`room-slot assignment ${passenger.full_name}`, await supabaseAdmin.from('departure_room_slot_assignments').insert({
        org_id: orgId,
        departure_id: antalya.departure.id,
        room_slot_id: slot.id,
        passenger_id: passenger.id,
        reservation_id: passenger.reservation_id,
        passenger_name: passenger.full_name,
      }));
    }
  }

  console.log(`Registered ${goldenSeedRecordIds.length} seed-owned root records under seed id ${SEED_ID}.`);

  console.log('✅ Golden demo seed complete.');
  console.log(`Organization: ${orgId}${isLegacyDemoOrg ? ' (legacy demo org: legacy records also reset)' : ''}`);
  console.log(`Packages: ${packages.length}`);
  console.log(`Departures: ${packages.length}`);
}

seed().catch((error) => {
  console.error('💥 Demo seed failed:', error);
  process.exit(1);
});
