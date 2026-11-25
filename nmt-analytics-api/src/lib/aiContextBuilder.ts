import { supabaseAdmin } from './supabase';

const MANAGER_ROLES = new Set(['manager', 'director', 'super_admin']);

export interface OrgAiContextSnapshot {
  generatedAt: string;
  roleScope: 'operational' | 'full_financial';
  upcomingDepartures: Array<{
    id: string;
    packageName: string;
    destination: string;
    departAt: string;
    capacity: number;
    status: string;
  }>;
  inquiriesSummary: {
    totalRecent: number;
    byStage: Record<string, number>;
  };
  quotationsSummary: {
    totalRecent: number;
    byStatus: Record<string, number>;
  };
  financialSummary?: {
    activeReservationsCount: number;
    openBalanceReservationsCount: number;
    totalOpenBalanceByCurrency: Record<string, number>;
  };
}

export async function buildOrgAiContext(orgId: string, role: string): Promise<OrgAiContextSnapshot> {
  const isFinancialAllowed = MANAGER_ROLES.has((role || '').toLowerCase());
  const nowIso = new Date().toISOString();

  const [depRes, inqRes, quoRes, resFin] = await Promise.all([
    supabaseAdmin
      .from('departures')
      .select('id, depart_at, capacity, status, packages(name, destination)')
      .eq('org_id', orgId)
      .gte('depart_at', nowIso)
      .order('depart_at', { ascending: true })
      .limit(15),
    supabaseAdmin
      .from('inquiries')
      .select('id, stage')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabaseAdmin
      .from('quotations')
      .select('id, status')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100),
    isFinancialAllowed
      ? supabaseAdmin
          .from('reservations')
          .select('id, balance_due, currency, status')
          .eq('org_id', orgId)
          .neq('status', 'cancelled')
          .limit(200)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const byStage: Record<string, number> = {};
  for (const row of inqRes.data || []) {
    const st = String((row as any).stage || 'unknown');
    byStage[st] = (byStage[st] || 0) + 1;
  }

  const byStatus: Record<string, number> = {};
  for (const row of quoRes.data || []) {
    const st = String((row as any).status || 'unknown');
    byStatus[st] = (byStatus[st] || 0) + 1;
  }

  const snapshot: OrgAiContextSnapshot = {
    generatedAt: nowIso,
    roleScope: isFinancialAllowed ? 'full_financial' : 'operational',
    upcomingDepartures: (depRes.data || []).map((d: any) => ({
      id: d.id,
      packageName: d.packages?.name || 'Package',
      destination: d.packages?.destination || '',
      departAt: d.depart_at,
      capacity: Number(d.capacity || 0),
      status: String(d.status || 'scheduled'),
    })),
    inquiriesSummary: {
      totalRecent: (inqRes.data || []).length,
      byStage,
    },
    quotationsSummary: {
      totalRecent: (quoRes.data || []).length,
      byStatus,
    },
  };

  if (isFinancialAllowed && Array.isArray(resFin.data)) {
    const totalOpenBalanceByCurrency: Record<string, number> = {};
    let openCount = 0;
    for (const r of resFin.data as any[]) {
      const due = Number(r.balance_due || 0);
      if (due > 0) {
        openCount++;
        const cur = String(r.currency || 'BAM');
        totalOpenBalanceByCurrency[cur] = Number(((totalOpenBalanceByCurrency[cur] || 0) + due).toFixed(2));
      }
    }
    snapshot.financialSummary = {
      activeReservationsCount: resFin.data.length,
      openBalanceReservationsCount: openCount,
      totalOpenBalanceByCurrency,
    };
  }

  return snapshot;
}
