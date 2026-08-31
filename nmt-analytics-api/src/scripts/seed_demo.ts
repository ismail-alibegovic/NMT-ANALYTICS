import 'dotenv/config';
import { supabaseAdmin } from '../lib/supabase';
import { materializeDepartureAccommodationFromPackage, syncDepartureRoomSlots } from '../lib/departureAccommodation';
import { upsertReservationAccommodation } from '../lib/reservationAccommodation';

const ORG_SLUG = 'travline-demo-2027';
const ORG_NAME = 'Travline Demo Agency 2027';
const ADMIN_EMAIL = 'admin@demo.com';
const SEED_USER_ID = process.env.SEED_USER_ID || '00000000-0000-0000-0000-000000000001';

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
  roomType: string;
  roomCount: number;
  passengers: string[];
  groupName?: string;
  passport?: boolean;
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
      { customerName: 'Ahmed Alić', phone: '+38761100003', email: 'ahmed.alic.demo@example.com', status: 'pending', paidFraction: 0, roomType: 'double', roomCount: 2, groupName: 'Društvo Alić', passengers: ['Ahmed Alić', 'Kenan Alić', 'Faruk Alić', 'Nedim Alić'], passport: true },
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

async function cleanupDemoOrg(orgId: string) {
  const groupIds = await demoGroupIds(orgId);
  await supabaseAdmin.from('departure_room_slot_assignments').delete().eq('org_id', orgId);
  await supabaseAdmin.from('departure_room_slots').delete().eq('org_id', orgId);
  await supabaseAdmin.from('reservation_accommodation_requirements').delete().eq('org_id', orgId);
  if (groupIds.length > 0) {
    await supabaseAdmin.from('trip_passenger_group_members').delete().in('group_id', groupIds);
  }
  await supabaseAdmin.from('trip_passenger_groups').delete().eq('org_id', orgId);
  await supabaseAdmin.from('departure_passengers').delete().eq('org_id', orgId);
  await supabaseAdmin.from('payments').delete().eq('org_id', orgId);
  await supabaseAdmin.from('transactions').delete().eq('org_id', orgId);
  await supabaseAdmin.from('reservations').delete().eq('org_id', orgId);
  await supabaseAdmin.from('departure_flights').delete().eq('org_id', orgId);
  await supabaseAdmin.from('flights').delete().eq('org_id', orgId);
  await supabaseAdmin.from('hotel_allocations').delete().eq('org_id', orgId);
  await supabaseAdmin.from('departures').delete().eq('org_id', orgId);
  await supabaseAdmin.from('package_hotels').delete().eq('org_id', orgId);
  await supabaseAdmin.from('packages').delete().eq('org_id', orgId);
  await supabaseAdmin.from('hotel_rooms').delete().eq('org_id', orgId);
  await supabaseAdmin.from('hotels').delete().eq('org_id', orgId);
  await supabaseAdmin.from('customers').delete().eq('org_id', orgId);
}

async function demoGroupIds(orgId: string) {
  const { data } = await supabaseAdmin.from('trip_passenger_groups').select('id').eq('org_id', orgId);
  return (data || []).map((g) => g.id);
}

async function seed() {
  console.log('🌱 Seeding deterministic Travline accommodation demo data...');

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .upsert({ name: ORG_NAME, slug: ORG_SLUG, currency: 'BAM', timezone: 'Europe/Sarajevo' }, { onConflict: 'slug' })
    .select('id')
    .single();
  if (orgError) throw orgError;
  const orgId = org.id;

  await supabaseAdmin.from('profiles').upsert({ id: SEED_USER_ID, email: ADMIN_EMAIL, role: 'director', org_id: orgId }, { onConflict: 'id' });
  await cleanupDemoOrg(orgId);

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
        await supabaseAdmin
          .from('hotel_allocations')
          .update({ rooms_reserved: roomCount })
          .eq('org_id', orgId)
          .eq('departure_id', departure.id)
          .eq('room_type', roomType);
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
            notes: 'Demo flight number; not a real scheduled commercial flight.',
            active: true,
          })
          .select()
          .single();
        if (flightError) throw flightError;
        await supabaseAdmin.from('departure_flights').insert({
          org_id: orgId,
          departure_id: departure.id,
          flight_id: flight.id,
          direction: direction === 'inbound' ? 'return' : 'outbound',
          segment_order: 0,
        });
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

      const totalAmount = spec.basePrice * reservationSpec.passengers.length;
      const paidAmount = Math.round(totalAmount * reservationSpec.paidFraction);
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
          total_amount: totalAmount,
          paid_amount: paidAmount,
          currency: 'BAM',
          source: 'agent',
        })
        .select()
        .single();
      if (reservationError) throw reservationError;

      const { data: allocation, error: allocationError } = await supabaseAdmin
        .from('hotel_allocations')
        .select('id')
        .eq('org_id', orgId)
        .eq('departure_id', departure.id)
        .eq('room_type', reservationSpec.roomType)
        .single();
      if (allocationError) throw allocationError;

      await upsertReservationAccommodation(reservation.id, orgId, {
        hotelAllocationId: allocation.id,
        roomCount: reservationSpec.roomCount,
        guestsExpected: reservationSpec.passengers.length,
        notes: reservationSpec.groupName ? `${reservationSpec.groupName} putuje zajedno` : null,
      });

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
        await supabaseAdmin.from('trip_passenger_group_members').insert(passengerRowsCreated.map((p) => ({ group_id: group.id, passenger_id: p.id })));
      }

      if (paidAmount > 0) {
        await supabaseAdmin.from('payments').insert({
          org_id: orgId,
          reservation_id: reservation.id,
          amount: paidAmount,
          currency: 'BAM',
          status: 'succeeded',
          payment_date: '2026-08-31',
          payment_method: 'demo',
        });
      }

      if (reservationSpec.status === 'confirmed') booked += reservationSpec.passengers.length;
    }

    await supabaseAdmin.from('departures').update({ booked }).eq('id', departure.id).eq('org_id', orgId);
    seeded.push({ package: pkg, departure });
  }

  const antalya = seeded.find((item) => item.package.name === 'Antalya Summer 2027');
  if (antalya) {
    const { data: slots } = await supabaseAdmin
      .from('departure_room_slots')
      .select('id, room_type, slot_number, capacity')
      .eq('org_id', orgId)
      .eq('departure_id', antalya.departure.id)
      .in('room_type', ['double', 'triple'])
      .order('room_type')
      .order('slot_number');
    const { data: passengers } = await supabaseAdmin
      .from('departure_passengers')
      .select('id, full_name, reservation_id')
      .eq('org_id', orgId)
      .eq('departure_id', antalya.departure.id)
      .order('full_name');
    const byName = new Map((passengers || []).map((p) => [p.full_name, p]));
    const doubleSlots = (slots || []).filter((s) => s.room_type === 'double');
    const tripleSlots = (slots || []).filter((s) => s.room_type === 'triple');
    const seedAssignments = [
      [doubleSlots[0], byName.get('Amina Hadžić')],
      [doubleSlots[0], byName.get('Emir Hadžić')],
      [doubleSlots[1], byName.get('Maja Kovačević')],
      [tripleSlots[0], byName.get('Sara Begić')],
      [tripleSlots[0], byName.get('Lejla Begić')],
      [tripleSlots[0], byName.get('Hana Begić')],
    ].filter(([slot, passenger]) => slot && passenger) as any[];

    for (const [slot, passenger] of seedAssignments) {
      await supabaseAdmin.from('departure_room_slot_assignments').insert({
        org_id: orgId,
        departure_id: antalya.departure.id,
        room_slot_id: slot.id,
        passenger_id: passenger.id,
        reservation_id: passenger.reservation_id,
        passenger_name: passenger.full_name,
      });
    }
  }

  console.log('✅ Demo seed complete.');
  console.log(`Organization: ${ORG_NAME} (${ORG_SLUG})`);
  console.log(`Packages: ${packages.length}`);
  console.log(`Departures: ${packages.length}`);
}

seed().catch((error) => {
  console.error('💥 Demo seed failed:', error);
  process.exit(1);
});
