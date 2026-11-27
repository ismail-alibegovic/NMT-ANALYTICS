import { z } from 'zod';
import { supabaseAdmin } from './supabase';

export interface TypedBusinessTool<TInput = any> {
  name: string;
  description: string;
  category: 'read_only' | 'draft_actions';
  minRole: 'viewer' | 'agent' | 'manager' | 'director';
  requiresConfirmation: boolean;
  inputSchema: z.ZodType<TInput>;
  execute: (orgId: string, role: string, args: TInput) => Promise<Record<string, any>>;
}

const MANAGER_ROLES = new Set(['manager', 'director', 'super_admin']);

const ACADEMY_KNOWLEDGE = [
  { topic: 'customers', title: 'Customers', summary: 'Central CRM directory (/customers) storing traveler/client contact details and linked inquiries, quotations, and reservations.' },
  { topic: 'inquiries_quotations', title: 'Sales Funnel: Inquiries & Quotations', summary: 'Leads enter via Inquiries (/inquiries) or Public Forms, convert into Quotations (/quotations) with day-by-day items, net price, markup, and sell totals, and convert into Reservations.' },
  { topic: 'packages_vs_departures', title: 'Packages vs Departures', summary: 'Packages (/packages) are reusable tour templates (destination, duration, base price, transport, included hotels/services). Departures (/departures) are dated trip instances with capacity, booked seats, room slots, bus/flight seating, and profitability.' },
  { topic: 'reservations_passengers', title: 'Reservations & Passengers', summary: 'Reservations (/reservations) link a client, departure/package, party size, installment schedule, and departure_passengers records with passport/DOB readiness.' },
  { topic: 'payments_refunds', title: 'Payments & Refunds Ledger', summary: 'All incoming payments and outgoing refunds are recorded in the canonical payments ledger (/payments) separated strictly by currency (BAM, EUR, USD).' },
  { topic: 'receipts_pu', title: 'Non-Fiscal Payment Receipts (PU)', summary: 'Un-fiscalized payment confirmations use PU-YYYY-XXXX numbering and are labeled POTVRDA UPLATE (Nefiskalni dokument). Issued receipts are immutable; corrections require a refund/storno receipt.' },
  { topic: 'rooming_seating', title: 'Rooming & Bus Seating', summary: 'Departure Workspace tabs manage hotel allocations, room slot assignments (departure_room_slot_assignments), and vehicle seat maps.' },
  { topic: 'manifests_vouchers', title: 'Manifests & Batch Vouchers', summary: 'Generated per departure from active (non-cancelled) reservations and departure_passengers. Cancelled bookings are automatically excluded.' },
  { topic: 'ai_assistant_proposals', title: 'Travline AI Assistant & Proposals', summary: 'Travline AI is read-only for Q&A and creates editable Action Proposals (/ai/proposals) that require explicit human confirmation before mutating business records.' },
];

export const BUSINESS_TOOL_REGISTRY: TypedBusinessTool[] = [
  {
    name: 'search_customers',
    description: 'Search customers in the organization by name, phone, or email.',
    category: 'read_only',
    minRole: 'agent',
    requiresConfirmation: false,
    inputSchema: z.object({ query: z.string().max(100).optional() }),
    execute: async (orgId, _role, args) => {
      let q = supabaseAdmin
        .from('customers')
        .select('id, full_name, phone, email, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(15);
      if (args.query?.trim()) {
        q = q.ilike('full_name', `%${args.query.trim()}%`);
      }
      const { data } = await q;
      return { customers: (data || []).map((c: any) => ({ ...c, route: `/customers/${c.id}` })) };
    },
  },
  {
    name: 'search_packages',
    description: 'List active travel packages with destination, durationDays, basePrice, currency, and maxParticipants.',
    category: 'read_only',
    minRole: 'agent',
    requiresConfirmation: false,
    inputSchema: z.object({ limit: z.number().int().min(1).max(30).default(15) }),
    execute: async (orgId, _role, args) => {
      const { data } = await supabaseAdmin
        .from('packages')
        .select('id, name, destination, duration_days, base_price, currency, max_participants, transport_type, trip_type, is_active')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(args.limit || 15);
      return {
        packages: (data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          destination: p.destination,
          durationDays: p.duration_days,
          basePrice: Number(p.base_price || 0),
          currency: p.currency || 'BAM',
          maxParticipants: p.max_participants,
          transportType: p.transport_type,
          tripType: p.trip_type,
          route: `/packages/${p.id}`,
        })),
      };
    },
  },
  {
    name: 'search_inquiries_and_quotations',
    description: 'List recent inquiries and quotations in the organization sales pipeline.',
    category: 'read_only',
    minRole: 'agent',
    requiresConfirmation: false,
    inputSchema: z.object({}),
    execute: async (orgId) => {
      const [{ data: inq }, { data: quo }] = await Promise.all([
        supabaseAdmin
          .from('inquiries')
          .select('id, contact_name, destination, travelers, stage, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabaseAdmin
          .from('quotations')
          .select('id, reference, title, status, currency, sell_total, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      return {
        inquiries: (inq || []).map((i: any) => ({ ...i, route: '/inquiries' })),
        quotations: (quo || []).map((q: any) => ({ ...q, route: `/quotations/${q.id}` })),
      };
    },
  },
  {
    name: 'search_open_balances',
    description: 'Find active non-cancelled reservations with outstanding balances (who owes money).',
    category: 'read_only',
    minRole: 'manager',
    requiresConfirmation: false,
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(15) }),
    execute: async (orgId, role, args) => {
      if (!MANAGER_ROLES.has((role || '').toLowerCase())) return { error: 'INSUFFICIENT_ROLE_FOR_FINANCIAL_DATA' };
      const { data } = await supabaseAdmin
        .from('reservations')
        .select('id, customer_name, total_amount, paid_amount, balance_due, currency, status, departures(depart_at, packages(name))')
        .eq('org_id', orgId)
        .neq('status', 'cancelled')
        .gt('balance_due', 0)
        .order('balance_due', { ascending: false })
        .limit(args.limit || 15);

      const byCurrency: Record<string, number> = {};
      for (const r of (data || []) as any[]) {
        const cur = r.currency || 'BAM';
        byCurrency[cur] = Number(((byCurrency[cur] || 0) + Number(r.balance_due || 0)).toFixed(2));
      }
      return {
        openBalanceCount: (data || []).length,
        totalOpenByCurrency: byCurrency,
        items: (data || []).map((r: any) => ({
          id: r.id,
          customerName: r.customer_name,
          balanceDue: Number(r.balance_due || 0),
          currency: r.currency || 'BAM',
          packageName: r.departures?.packages?.name || null,
          route: `/reservations/${r.id}`,
        })),
      };
    },
  },
  {
    name: 'get_financial_summary',
    description: 'Get payments received, refunds, and supplier obligations grouped strictly by currency.',
    category: 'read_only',
    minRole: 'manager',
    requiresConfirmation: false,
    inputSchema: z.object({}),
    execute: async (orgId, role) => {
      if (!MANAGER_ROLES.has((role || '').toLowerCase())) return { error: 'INSUFFICIENT_ROLE_FOR_FINANCIAL_DATA' };
      const [{ data: payRows }, { data: supRows }] = await Promise.all([
        supabaseAdmin
          .from('payments')
          .select('amount, currency, status, payment_type')
          .eq('org_id', orgId)
          .eq('status', 'succeeded')
          .limit(300),
        supabaseAdmin
          .from('supplier_obligations')
          .select('amount, paid_amount, currency, status')
          .eq('org_id', orgId)
          .neq('status', 'cancelled')
          .limit(200),
      ]);

      const receivedByCurrency: Record<string, number> = {};
      const refundsByCurrency: Record<string, number> = {};
      for (const p of (payRows || []) as any[]) {
        const cur = String(p.currency || 'BAM');
        const amt = Number(p.amount || 0);
        if (amt < 0 || p.payment_type === 'refund') {
          refundsByCurrency[cur] = Number(((refundsByCurrency[cur] || 0) + Math.abs(amt)).toFixed(2));
        } else {
          receivedByCurrency[cur] = Number(((receivedByCurrency[cur] || 0) + amt).toFixed(2));
        }
      }

      const unpaidObligationsByCurrency: Record<string, number> = {};
      for (const s of (supRows || []) as any[]) {
        const cur = String(s.currency || 'BAM');
        const unpaid = Math.max(0, Number(s.amount || 0) - Number(s.paid_amount || 0));
        if (unpaid > 0) {
          unpaidObligationsByCurrency[cur] = Number(((unpaidObligationsByCurrency[cur] || 0) + unpaid).toFixed(2));
        }
      }

      return {
        receivedByCurrency,
        refundsByCurrency,
        unpaidSupplierObligationsByCurrency: unpaidObligationsByCurrency,
      };
    },
  },
  {
    name: 'search_departures_capacity',
    description: 'List upcoming departures with total capacity and active booked seats.',
    category: 'read_only',
    minRole: 'agent',
    requiresConfirmation: false,
    inputSchema: z.object({ limit: z.number().int().min(1).max(30).default(15) }),
    execute: async (orgId, _role, args) => {
      const nowIso = new Date().toISOString();
      const [{ data: deps }, { data: resRows }] = await Promise.all([
        supabaseAdmin
          .from('departures')
          .select('id, depart_at, capacity, status, packages(name, destination)')
          .eq('org_id', orgId)
          .gte('depart_at', nowIso)
          .neq('status', 'cancelled')
          .order('depart_at', { ascending: true })
          .limit(args.limit || 15),
        supabaseAdmin
          .from('reservations')
          .select('departure_id, party_size')
          .eq('org_id', orgId)
          .neq('status', 'cancelled'),
      ]);

      const bookedMap = new Map<string, number>();
      for (const r of (resRows || []) as any[]) {
        if (r.departure_id) bookedMap.set(r.departure_id, (bookedMap.get(r.departure_id) || 0) + Number(r.party_size || 1));
      }
      return {
        departures: (deps || []).map((d: any) => {
          const booked = bookedMap.get(d.id) || 0;
          const cap = Number(d.capacity || 0);
          return {
            id: d.id,
            packageName: d.packages?.name || 'Departure',
            destination: d.packages?.destination || '',
            departAt: d.depart_at,
            capacity: cap,
            booked,
            availableSeats: Math.max(0, cap - booked),
            route: `/departures/${d.id}`,
          };
        }),
      };
    },
  },
  {
    name: 'get_operational_readiness',
    description: 'Check passengers missing seat assignments or room assignments on upcoming departures.',
    category: 'read_only',
    minRole: 'agent',
    requiresConfirmation: false,
    inputSchema: z.object({}),
    execute: async (orgId) => {
      const [{ data: pax }, { data: roomAssign }] = await Promise.all([
        supabaseAdmin
          .from('departure_passengers')
          .select('id, full_name, seat_number, departure_id')
          .eq('org_id', orgId)
          .limit(300),
        supabaseAdmin
          .from('departure_room_slot_assignments')
          .select('passenger_id')
          .eq('org_id', orgId),
      ]);
      const assignedRoomIds = new Set((roomAssign || []).map((a: any) => a.passenger_id));
      const allPax = (pax || []) as any[];
      const missingSeats = allPax.filter((p) => p.seat_number === null || p.seat_number === undefined);
      const missingRooms = allPax.filter((p) => !assignedRoomIds.has(p.id));
      return {
        totalPassengersChecked: allPax.length,
        missingSeatsCount: missingSeats.length,
        missingRoomsCount: missingRooms.length,
        sampleMissingSeats: missingSeats.slice(0, 5).map((p) => ({ id: p.id, fullName: p.full_name, departureId: p.departure_id })),
        sampleMissingRooms: missingRooms.slice(0, 5).map((p) => ({ id: p.id, fullName: p.full_name, departureId: p.departure_id })),
      };
    },
  },
  {
    name: 'search_academy_docs',
    description: 'Retrieve verified Travline product documentation and workflow explanations.',
    category: 'read_only',
    minRole: 'viewer',
    requiresConfirmation: false,
    inputSchema: z.object({}),
    execute: async () => ({ guides: ACADEMY_KNOWLEDGE }),
  },
];

export async function runAuthorizedReadOnlyTools(orgId: string, role: string): Promise<Record<string, any>> {
  const results: Record<string, any> = {};
  const isManagerPlus = MANAGER_ROLES.has((role || '').toLowerCase());
  await Promise.all(
    BUSINESS_TOOL_REGISTRY.map(async (tool) => {
      if (tool.category !== 'read_only') return;
      if (tool.minRole === 'manager' && !isManagerPlus) return;
      try {
        results[tool.name] = await tool.execute(orgId, role, {});
      } catch {
        results[tool.name] = { error: 'TOOL_EXECUTION_FAILED' };
      }
    }),
  );
  return results;
}
