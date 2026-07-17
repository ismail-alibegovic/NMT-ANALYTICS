import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useT } from '../../lib/i18n/context';
import { getReservations, type Reservation } from '../../api/reservations';
import { getDepartures, type Departure } from '../../api/departures';
import { formatCurrency, formatDate } from '../../utils/business';

const statusColor: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  confirmed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  completed: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

export default function PortalDashboard() {
  const { t } = useT();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [res, dep] = await Promise.all([
          getReservations({ limit: 1000 }),
          getDepartures({ limit: 1000 }),
        ]);
        if (!mounted) return;
        setReservations(res.data);
        // Sort departures ascending by date; only upcoming ones
        const now = Date.now();
        const upcoming = (dep.data || [])
          .filter((d) => new Date(d.depart_at).getTime() >= now)
          .sort((a, b) => new Date(a.depart_at).getTime() - new Date(b.depart_at).getTime());
        setDepartures(upcoming.slice(0, 5));
      } catch {
        // fall through with empty state
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const recent = reservations.slice(0, 5);
  const bookings = reservations.length;
  const revenue = reservations
    .filter((r) => r.status !== 'cancelled')
    .reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  const outstanding = reservations
    .filter((r) => r.status !== 'cancelled')
    .reduce((sum, r) => sum + (r.balanceDue || 0), 0);
  const avg = bookings > 0 ? Math.round(revenue / bookings) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.portal.dashboard.title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.portal.dashboard.subtitle}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t.portal.dashboard.cards.revenue} value={formatCurrency(revenue)} accent="brand" />
        <StatCard label={t.portal.dashboard.cards.bookings} value={String(bookings)} accent="emerald" />
        <StatCard label={t.portal.dashboard.cards.avgValue} value={formatCurrency(avg)} accent="amber" />
        <StatCard label={t.portal.dashboard.cards.outstanding} value={formatCurrency(outstanding)} accent="rose" />
      </div>

      {/* Recent reservations + Upcoming departures */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white">
              {t.portal.dashboard.recentReservations}
            </h2>
            <Link to="/portal/reservations" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
              →
            </Link>
          </div>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">{t.portal.dashboard.empty}</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{r.customerName}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{r.packageName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{formatCurrency(r.totalAmount)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${(statusColor[r.status] || statusColor.pending)}`}>
                      {r.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white">
              {t.portal.dashboard.upcomingDepartures}
            </h2>
            <Link to="/portal/departures" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
              →
            </Link>
          </div>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : departures.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">{t.portal.dashboard.empty}</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {departures.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{d.packageName}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{formatDate(d.depart_at)}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {d.booked}/{d.capacity}
                    </span>
                    <p className="text-xs text-gray-400">{d.destination}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="py-3">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-2 h-2.5 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-gray-800/70" />
        </li>
      ))}
    </ul>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: 'brand' | 'emerald' | 'amber' | 'rose' }) {
  const accentRing: Record<typeof accent, string> = {
    brand: 'ring-brand-200 dark:ring-brand-900/40',
    emerald: 'ring-emerald-200 dark:ring-emerald-900/40',
    amber: 'ring-amber-200 dark:ring-amber-900/40',
    rose: 'ring-rose-200 dark:ring-rose-900/40',
  };
  const accentText: Record<typeof accent, string> = {
    brand: 'text-brand-600 dark:text-brand-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
  };
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 ring-1 ring-inset dark:border-gray-800 dark:bg-gray-900 ${accentRing[accent]}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1.5 text-xl font-bold ${accentText[accent]}`}>{value}</p>
    </div>
  );
}
