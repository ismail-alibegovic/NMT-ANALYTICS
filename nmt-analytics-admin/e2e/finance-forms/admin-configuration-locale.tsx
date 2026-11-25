import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router';
import AuditLogs from '../../src/pages/admin/AuditLogs';
import Profile from '../../src/pages/Profile';
import PortalSettings from '../../src/pages/portal/PortalSettings';
import Integrations from '../../src/pages/admin/Integrations';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/context/ToastContext';
import { BrandingProvider } from '../../src/components/portal/BrandingProvider';
import { I18nProvider, useT } from '../../src/lib/i18n/context';
import { setFixtureRole } from './app-context';
import '../../src/index.css';

if (import.meta.env.MODE !== 'form-contract') throw Error('Isolated test server required');
setFixtureRole('director');
const page = new URLSearchParams(location.search).get('page') || 'profile';

// eslint-disable-next-line react-refresh/only-export-components
function FixtureShell() {
  const { lang, toggleLang } = useT();
  return (
    <main className="mx-auto max-w-6xl p-4">
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          data-testid="toggle-lang"
          onClick={toggleLang}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          {lang.toUpperCase()}
        </button>
      </div>
      {page === 'audit' ? (
        <AuditLogs />
      ) : page === 'portal' ? (
        <PortalSettings />
      ) : page === 'integrations' ? (
        <Integrations />
      ) : (
        <Profile />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <I18nProvider>
        <MemoryRouter>
          <ThemeProvider>
            <ToastProvider>
              <BrandingProvider>
                <FixtureShell />
              </BrandingProvider>
            </ToastProvider>
          </ThemeProvider>
        </MemoryRouter>
      </I18nProvider>
    </HelmetProvider>
  </StrictMode>,
);
