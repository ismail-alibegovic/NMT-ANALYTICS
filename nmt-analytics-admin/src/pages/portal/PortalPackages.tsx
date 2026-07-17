import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n/context';
import { getPackages, type Package } from '../../api/packages';
import { formatCurrency } from '../../utils/business';

export default function PortalPackages() {
  const { t } = useT();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getPackages({ limit: 1000 });
        if (mounted) setPackages(res.data);
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.portal.packages.title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.portal.packages.subtitle}</p>
      </div>

      {loading ? (
        <SkeletonGrid />
      ) : packages.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400 dark:border-gray-700">
          {t.portal.packages.noData}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((p) => {
            const price = p.price ?? p.base_price ?? 0;
            const curr = p.currency || 'BAM';
            const isActive = p.active ?? p.is_active ?? true;
            return (
              <div
                key={p.id}
                className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition hover:shadow-sm dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    aria-hidden
                  />
                  <span className={`text-xs font-medium ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                    {isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <h3 className="mt-2 text-base font-semibold text-gray-900 dark:text-white">{p.name}</h3>
                {p.destination && (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{p.destination}</p>
                )}
                {p.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">{p.description}</p>
                )}
                <div className="mt-4 flex items-end justify-between">
                  <span className="text-lg font-bold text-brand-600 dark:text-brand-400">
                    {formatCurrency(price)}
                  </span>
                  <div className="text-right text-xs text-gray-400">
                    <p>{curr}</p>
                    {p.durationDays ? <p>{p.durationDays} days</p> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <div className="h-2 w-10 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-gray-800/70" />
          <div className="h-6 w-1/4 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
        </div>
      ))}
    </div>
  );
}
