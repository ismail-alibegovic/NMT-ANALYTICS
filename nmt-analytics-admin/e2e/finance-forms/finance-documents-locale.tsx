import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router';
import UnifiedPayments from '../../src/pages/admin/UnifiedPayments';
import Receipts from '../../src/pages/operations/Receipts';
import Contracts from '../../src/pages/operations/Contracts';
import Documents from '../../src/pages/admin/Documents';
import PdfTemplateEditor from '../../src/pages/admin/PdfTemplateEditor';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/context/ToastContext';
import { I18nProvider, useT } from '../../src/lib/i18n/context';
import { setFixtureRole } from './app-context';
import '../../src/index.css';

if (import.meta.env.MODE !== 'form-contract') throw Error('Isolated test server required');
setFixtureRole('director');
const page = new URLSearchParams(location.search).get('page') || 'payments';

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
      {page === 'receipts' ? (
        <Receipts />
      ) : page === 'contracts' ? (
        <Contracts />
      ) : page === 'documents' ? (
        <Documents />
      ) : page === 'templates' ? (
        <PdfTemplateEditor />
      ) : (
        <UnifiedPayments />
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
              <FixtureShell />
            </ToastProvider>
          </ThemeProvider>
        </MemoryRouter>
      </I18nProvider>
    </HelmetProvider>
  </StrictMode>,
);
