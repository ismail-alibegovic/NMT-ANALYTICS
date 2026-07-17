import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n/context';
import { getDepartures, type Departure } from '../../api/departures';
import { formatDate } from '../../utils/business';

const statusColor: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  completed: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

export default function PortalDepartures() {
  const { t } = useT();
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getDepartures({ limit: 1000 });
        if (mounted) {
          const sorted = [...res.data].sort(
            (a, b) => new Date(a.depart_at).getTime() - new Date(b.depart_at).getTime()
          );
          setDepartures(sorted);
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.portal.departures.title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.portal.departures.subtitle}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {loading ? (
          <Skeleton />
        ) : departures.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">{t.portal.departures.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
                  <th className="px-4 py-3 font-medium">{t.portal.departures.package}</th>
                  <th className="px-4 py-3 font-medium">{t.portal.departures.date}</th>
                  <th className="px-4 py-3 font-medium">{t.portal.departures.capacity}</th>
                  <th className="px-4 py-3 font-medium">{t.portal.departures.booked}</th>
                  <th className="px-4 py-3 font-medium">{t.common.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {departures.map((d) => {
                  const pct = d.capacity > 0 ? Math.round((d.booked / d.capacity) * 100) : 0;
                  return (
                    <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800 dark:text-gray-200">{d.packageName}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{d.destination}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{formatDate(d.depart_at)}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{d.capacity}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-700 dark:text-gray-300">{d.booked}</span>
                          <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 sm:block">
                            <div
                              className={`h-full ${pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${(statusColor[d.status] || statusColor.active)}`}>
                          {d.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800/60" />
      ))}
    </div>
  );
}
