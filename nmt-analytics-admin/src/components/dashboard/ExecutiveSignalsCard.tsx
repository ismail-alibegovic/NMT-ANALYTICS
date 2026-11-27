import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Badge from '../ui/badge/Badge';
import { useT } from '../../lib/i18n/context';
import { getExecutiveSignals, type ExecutiveSignalItem } from '../../api/aiAssistant';

export default function ExecutiveSignalsCard() {
  const { t } = useT();
  const s = t.executiveSignals as {
    title: string;
    subtitle: string;
    askAiLink: string;
    openAction: string;
    items: Record<ExecutiveSignalItem['key'], { label: string; healthy: string }>;
  };

  const [signals, setSignals] = useState<ExecutiveSignalItem[]>([]);

  useEffect(() => {
    let active = true;
    getExecutiveSignals()
      .then((res) => {
        if (active && Array.isArray(res?.signals)) setSignals(res.signals);
      })
      .catch(() => {
        // Non-blocking executive card; silently omit if analytics module is disabled.
      });
    return () => {
      active = false;
    };
  }, []);

  if (signals.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{s.title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{s.subtitle}</p>
        </div>
        <Link to="/ai-assistant" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
          {s.askAiLink} →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {signals.map((sig) => {
          const copy = s.items[sig.key];
          if (!copy) return null;
          const color = sig.count === 0 ? 'success' : sig.severity === 'high' ? 'error' : 'warning';
          return (
            <Link
              key={sig.key}
              to={sig.route}
              className="flex items-center justify-between rounded-xl border border-gray-200 p-3.5 transition hover:border-brand-300 dark:border-gray-800 dark:hover:border-brand-500/40"
            >
              <div className="pr-2">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{copy.label}</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {sig.count === 0 ? copy.healthy : s.openAction}
                </p>
              </div>
              <Badge size="sm" color={color}>
                {sig.count}
              </Badge>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
