import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, useT } from '../../src/lib/i18n/context';
import { ToastProvider } from '../../src/context/ToastContext';
import NewSaleWizard from '../../src/components/reservations/NewSaleWizard';
import '../../src/index.css';

if (import.meta.env.MODE !== 'form-contract') throw new Error('Isolated form test server required');
export default function Fixture() {
  const [open, setOpen] = useState(false);
  const { setLang } = useT();
  // Test-only context control: the production modal correctly traps focus,
  // so the browser fixture simulates a preference update without bypassing it.
  useEffect(() => {
    const handler = (event: Event) => {
      const lang = (event as CustomEvent).detail;
      if (lang === 'en' || lang === 'bs') setLang(lang);
    };
    window.addEventListener('fixture-language', handler);
    return () => window.removeEventListener('fixture-language', handler);
  }, [setLang]);
  return <main className="min-h-screen bg-white p-4 text-gray-900 dark:bg-gray-950 dark:text-white">
    <button onClick={() => setOpen(true)}>Open sale fixture</button>
    <NewSaleWizard isOpen={open} onClose={() => setOpen(false)} onCreated={() => setOpen(false)} initialPackageId="package-1" initialDepartureId="departure-1" />
  </main>;
}
createRoot(document.getElementById('root')!).render(<I18nProvider><ToastProvider><Fixture /></ToastProvider></I18nProvider>);
