import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router';
import { I18nProvider, useT } from '../../src/lib/i18n/context';
import { ToastProvider } from '../../src/context/ToastContext';
import DateRangeFilter from '../../src/components/common/DateRangeFilter';
import ErrorBoundary from '../../src/components/common/ErrorBoundary';
import NotFound from '../../src/pages/OtherPage/NotFound';
import '../../src/index.css';

if (import.meta.env.MODE !== 'form-contract') throw new Error('Isolated form test server required');

const surface = new URLSearchParams(window.location.search).get('surface');

function SyntheticThrower(): never {
  throw new Error('Synthetic bootstrap error');
}

function SharedLocaleHarness() {
  const { toggleLang, t } = useT();
  return (
    <main className="min-h-screen space-y-6 bg-white p-4 dark:bg-gray-950">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={toggleLang}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-gray-200"
        >
          {t.settings.language}
        </button>
      </div>
      <DateRangeFilter onRangeChange={() => {}} />
      <NotFound />
    </main>
  );
}

const app =
  surface === 'error-boundary' ? (
    <ErrorBoundary>
      <SyntheticThrower />
    </ErrorBoundary>
  ) : (
    <HelmetProvider>
      <MemoryRouter>
        <I18nProvider>
          <ToastProvider>
            <SharedLocaleHarness />
          </ToastProvider>
        </I18nProvider>
      </MemoryRouter>
    </HelmetProvider>
  );

createRoot(document.getElementById('root')!).render(app);
