import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n/context';
import { getReservations, type Reservation } from '../../api/reservations';
import { formatCurrency, formatDate } from '../../utils/business';

const statusColor: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  confirmed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  completed: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

export default function PortalReservations() {
  const { t } = useT();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getReservations({ limit: 1000 });
        if (mounted) {
          const sorted = [...res.data].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setReservations(sorted);
        }
      } catch {
        // empty fallback
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.portal.reservations.title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.portal.reservations.subtitle}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800/60" />
            ))}
          </div>
        ) : reservations.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">{t.portal.reservations.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
                  <th className="px-4 py-3 font-medium">{t.portal.reservations.customer}</th>
                  <th className="px-4 py-3 font-medium">{t.portal.reservations.package}</th>
                  <th className="px-4 py-3 font-medium">{t.portal.reservations.status}</th>
                  <th className="px-4 py-3 font-medium">{t.portal.reservations.total}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {reservations.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800 dark:text-gray-200">{r.customerName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{formatDate(r.bookingDate || r.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.packageName}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${(statusColor[r.status] || statusColor.pending)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{formatCurrency(r.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
