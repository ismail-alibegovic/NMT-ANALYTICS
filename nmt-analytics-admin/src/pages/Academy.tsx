import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import PageMeta from '../components/common/PageMeta';
import Badge from '../components/ui/badge/Badge';
import Button from '../components/ui/button/Button';
import Input from '../components/form/input/InputField';
import EmptyState from '../components/ui/EmptyState';
import { useT } from '../lib/i18n/context';

type RoleFilter = 'all' | 'director' | 'manager' | 'agent' | 'operations';
type CategoryFilter = 'all' | 'setup' | 'sales' | 'operations' | 'finance' | 'security';

interface AcademyGuide {
  id: string;
  category: string;
  roles: string[];
  title: string;
  summary: string;
  steps: string[];
  tip: string;
  route: string;
  routeLabel: string;
}

export default function Academy() {
  const { t } = useT();
  const a = t.academy as {
    pageTitle: string;
    pageDescription: string;
    searchPlaceholder: string;
    roleFilterLabel: string;
    roles: Record<RoleFilter, string>;
    categories: Record<CategoryFilter, string>;
    stepsLabel: string;
    tipLabel: string;
    openModuleLabel: string;
    emptyTitle: string;
    emptyDescription: string;
    resetFilters: string;
    guides: AcademyGuide[];
  };

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const roleKeys: RoleFilter[] = ['all', 'director', 'manager', 'agent', 'operations'];
  const categoryKeys: CategoryFilter[] = ['all', 'setup', 'sales', 'operations', 'finance', 'security'];

  const filteredGuides = useMemo(() => {
    const q = search.trim().toLowerCase();
    return a.guides.filter((g) => {
      if (roleFilter !== 'all' && !g.roles.includes(roleFilter)) return false;
      if (categoryFilter !== 'all' && g.category !== categoryFilter) return false;
      if (!q) return true;
      const haystack = [g.title, g.summary, g.tip, ...g.steps].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [a.guides, search, roleFilter, categoryFilter]);

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('all');
    setCategoryFilter('all');
  };

  return (
    <div className="space-y-6">
      <PageMeta title={`${a.pageTitle} | Travline`} description={a.pageDescription} />
      <header className="border-b border-gray-200 pb-4 dark:border-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{a.pageTitle}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{a.pageDescription}</p>
      </header>

      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full md:max-w-md">
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={a.searchPlaceholder}
              aria-label={a.searchPlaceholder}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {a.roleFilterLabel}:
            </span>
            {roleKeys.map((rk) => (
              <button
                key={rk}
                type="button"
                onClick={() => setRoleFilter(rk)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  roleFilter === rk
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {a.roles[rk]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
          {categoryKeys.map((ck) => (
            <button
              key={ck}
              type="button"
              onClick={() => setCategoryFilter(ck)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === ck
                  ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-500/30 dark:bg-brand-500/15 dark:text-brand-300'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              {a.categories[ck]}
            </button>
          ))}
        </div>
      </div>

      {filteredGuides.length === 0 ? (
        <EmptyState
          title={a.emptyTitle}
          description={a.emptyDescription}
          action={{ label: a.resetFilters, onClick: resetFilters }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {filteredGuides.map((guide) => (
            <article
              key={guide.id}
              className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Badge size="sm" color="info">
                    {a.categories[guide.category as CategoryFilter]}
                  </Badge>
                  <div className="flex flex-wrap gap-1.5">
                    {guide.roles.map((r) => (
                      <Badge key={r} size="sm" color="light">
                        {a.roles[r as RoleFilter]}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {guide.title}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {guide.summary}
                  </p>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {a.stepsLabel}
                  </h3>
                  <ol className="mt-2 space-y-1.5 text-sm text-gray-700 dark:text-gray-300 list-decimal list-inside">
                    {guide.steps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                  <span className="font-semibold">{a.tipLabel}: </span>
                  {guide.tip}
                </div>
              </div>

              <div className="mt-5 flex justify-end border-t border-gray-100 pt-4 dark:border-gray-800">
                <Link to={guide.route}>
                  <Button variant="outline" size="sm">
                    {guide.routeLabel} →
                  </Button>
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
