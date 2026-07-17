import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { useT } from '../lib/i18n/context';
import { BrandingProvider, useBranding } from '../components/portal/BrandingProvider';
import SignOutButton from '../components/portal/SignOutButton';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

function PortalShell() {
  const { t } = useT();
  const { userContext } = useApp();
  const { branding } = useBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: NavItem[] = [
    { to: '/portal', label: t.portal.nav.dashboard, icon: <IconGrid /> },
    { to: '/portal/packages', label: t.portal.nav.packages, icon: <IconBox /> },
    { to: '/portal/departures', label: t.portal.nav.departures, icon: <IconCalendar /> },
    { to: '/portal/reservations', label: t.portal.nav.reservations, icon: <IconClipboard /> },
    { to: '/portal/customers', label: t.portal.nav.customers, icon: <IconUsers /> },
    { to: '/portal/settings', label: t.portal.nav.settings, icon: <IconCog /> },
  ];

  const isExact = (to: string) => location.pathname === to;
  const orgName = branding?.display_name || userContext?.org?.name || t.portal.layout.appTitle;
  const brand = branding?.primary_color || '#1D4ED8';
  const accent = branding?.accent_color || '#0EA5E9';

  const SidebarContent = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-800">
        <div className="flex items-center gap-3">
          {branding?.logo_url ? (
            <img
              src={branding.logo_url}
              alt={orgName}
              className="h-9 w-9 flex-shrink-0 rounded-lg object-cover"
              style={{ backgroundColor: `${brand}14` }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${brand}, ${accent})` }}
            >
              {orgName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{orgName}</p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{t.portal.layout.orgVerifiedFor}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {t.portal.layout.menu}
        </p>
        <ul className="space-y-1">
          {navItems.map((item) => {
            // /portal must be exactMatch; others by startsWith
            const active = item.to === '/portal'
              ? isExact('/portal')
              : location.pathname.startsWith(item.to);
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/portal'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                      active || isActive
                        ? 'text-white shadow-sm'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white',
                    ].join(' ')
                  }
                  style={active ? { backgroundColor: brand } : undefined}
                >
                  <span className="h-4 w-4 flex-shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Signed-in + sign out */}
      <div className="border-t border-gray-200 px-3 py-3 dark:border-gray-800">
        <NavLink
          to="/"
          onClick={() => setMobileOpen(false)}
          className="mb-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 12m0 0l6-3m-6 3h18M9 6l6 3-6 3M3 12V8.5A1.5 1.5 0 014.5 7H12" />
          </svg>
          <span>{t.portal.layout.backToStaffApp}</span>
        </NavLink>
        <div className="mb-2 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-800/60">
          <span className="block truncate text-gray-500 dark:text-gray-400">{t.portal.layout.signedInAs}</span>
          <span className="block truncate font-medium text-gray-800 dark:text-gray-200">
            {userContext?.user?.email}
          </span>
        </div>
        <SignOutButton />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-1000">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:block">
        {SidebarContent}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl dark:bg-gray-900">
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-h-screen flex-1 flex-col md:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-gray-200 bg-white/80 px-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80 md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 md:hidden"
              aria-label={t.portal.layout.menu}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {t.portal.layout.appTitle}
            </span>
            <span className="hidden text-xs text-gray-400 dark:text-gray-500 sm:inline">
              {t.portal.layout.brand}
            </span>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-xs font-medium text-gray-500 transition hover:text-gray-800 dark:text-gray-400 dark:hover:text-white sm:text-sm"
          >
            {t.portal.layout.backToStaffApp}
          </button>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function PortalLayout() {
  return (
    <BrandingProvider>
      <PortalShell />
    </BrandingProvider>
  );
}

// ── Inline nav icons (svg stroke, no external deps) ─────────────────
function IconGrid() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25A2.25 2.25 0 0 1 13.5 8.25V6Zm0 9.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5-9 5m18 0L12 12m9-4.5v9l-9 5m0-9.5l-9-5m9 5v9.5m0 0L3 16.5v-9" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  );
}
function IconClipboard() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75M15.75 6H17.25A2.25 2.25 0 0 0 19.5 3.75V3.6A2.25 2.25 0 0 0 17.25 1.35H6.75A2.25 2.25 0 0 0 4.5 3.75v.36A2.25 2.25 0 0 0 6.75 6.75h1.5m0 0v14.25a2.25 2.25 0 0 0 2.25 2.25h3a2.25 2.25 0 0 0 2.25-2.25V6.75h-7.5Z" />
    </svg>
  );
}
function IconUsers() {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    );
  }
function IconCog() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.416c.51-.175 1.075.092 1.391.602l1.297 2.247c.31.536.23 1.21-.243 1.583l-.995.765a1.054 1.054 0 0 0-.402 1.035 5.49 5.49 0 0 1 0 1.427 1.054 1.054 0 0 0 .402 1.035l.995.765c.474.373.553 1.047.243 1.583l-1.297 2.247c-.316.51-.88.777-1.391.602l-1.217-.416a1.296 1.296 0 0 0-1.075.124 4.91 4.91 0 0 1-.22.127c-.332.184-.582.496-.645.87l-.213 1.281c-.09.542-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281a1.282 1.282 0 0 0-.645-.87 5.49 5.49 0 0 1-.22-.127c-.355-.133-.75-.072-1.075.124l-1.217.416c-.51.175-1.075-.092-1.391-.602l-1.297-2.247a1.146 1.146 0 0 1 .243-1.583l.995-.765a1.054 1.054 0 0 0 .402-1.035 5.49 5.49 0 0 0 0-1.427 1.054 1.054 0 0 0-.402-1.035l-.995-.765a1.146 1.146 0 0 1-.243-1.583L6.343 7.94c.316-.51.88-.777 1.391-.602l1.217.416a1.296 1.296 0 0 0 1.075-.124c.073-.044.146-.087.22-.127.332-.184.582-.496.645-.87l.213-1.28Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default PortalLayout;
