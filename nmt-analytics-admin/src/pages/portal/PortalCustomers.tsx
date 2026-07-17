import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n/context';
import { getCustomers, type Customer } from '../../api/customers';
import { formatDate } from '../../utils/business';

const statusColor: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  inactive: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

export default function PortalCustomers() {
  const { t } = useT();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getCustomers({ limit: 1000 });
        if (mounted) setCustomers(res.data);
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.portal.customers.title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.portal.customers.subtitle}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800/60" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">{t.portal.customers.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
                  <th className="px-4 py-3 font-medium">{t.portal.customers.name}</th>
                  <th className="px-4 py-3 font-medium">{t.portal.customers.email}</th>
                  <th className="px-4 py-3 font-medium">{t.portal.customers.phone}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800 dark:text-gray-200">{c.full_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {c.status && (
                          <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${(statusColor[c.status] || statusColor.inactive)}`}>
                            {c.status}
                          </span>
                        )}
                        {formatDate(c.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.phone || '—'}</td>
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
