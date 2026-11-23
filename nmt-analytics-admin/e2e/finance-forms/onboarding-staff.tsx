import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router';
import OnboardingChecklist from '../../src/components/common/OnboardingChecklist';
import TeamManagementPanel from '../../src/components/settings/TeamManagementPanel';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/context/ToastContext';
import { I18nProvider, useT } from '../../src/lib/i18n/context';
import { setFixtureRole } from './app-context';
import '../../src/index.css';

if (import.meta.env.MODE !== 'form-contract') throw Error('Isolated test server required');
setFixtureRole('director');

// eslint-disable-next-line react-refresh/only-export-components
function FixtureShell() {
  const { lang, toggleLang } = useT();
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <div className="flex justify-end">
        <button
          type="button"
          data-testid="toggle-lang"
          onClick={toggleLang}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          {lang.toUpperCase()}
        </button>
      </div>
      <OnboardingChecklist />
      <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <TeamManagementPanel />
      </section>
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
              <FixtureShell />
            </ToastProvider>
          </ThemeProvider>
        </MemoryRouter>
      </I18nProvider>
    </HelmetProvider>
  </StrictMode>,
);
