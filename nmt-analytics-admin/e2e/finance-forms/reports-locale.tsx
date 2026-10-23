import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { I18nProvider, useT } from '../../src/lib/i18n/context';
import { ToastProvider } from '../../src/context/ToastContext';
import Reports from '../../src/pages/Reports';
import '../../src/index.css';

if (import.meta.env.MODE !== 'form-contract') throw new Error('Isolated form test server required');
export default function Fixture() {
  const { toggleLang, t } = useT();
  return <main className="min-h-screen bg-white p-4 dark:bg-gray-950">
    <button onClick={toggleLang}>{t.settings.language}</button>
    <Reports />
  </main>;
}
createRoot(document.getElementById('root')!).render(
  <HelmetProvider><I18nProvider><ToastProvider><Fixture /></ToastProvider></I18nProvider></HelmetProvider>,
);
