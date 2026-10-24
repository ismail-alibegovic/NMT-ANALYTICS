import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, useT } from '../../src/lib/i18n/context';
import { ToastProvider } from '../../src/context/ToastContext';
import EditReservationModal from '../../src/components/reservations/EditReservationModal';
import '../../src/index.css';
if (import.meta.env.MODE !== 'form-contract') throw new Error('Isolated form test server required');
export default function Fixture() {
  const [open, setOpen] = useState(false);
  const { setLang } = useT();
  useEffect(() => {
    const change = (event: Event) => { const lang = (event as CustomEvent).detail; if (lang === 'bs' || lang === 'en') setLang(lang); };
    window.addEventListener('fixture-language', change);
    return () => window.removeEventListener('fixture-language', change);
  }, [setLang]);
  return <main className="min-h-screen bg-white dark:bg-gray-950"><button onClick={() => setOpen(true)}>Open fixture</button><EditReservationModal isOpen={open} onClose={() => setOpen(false)} onSuccess={() => {}} reservationId="reservation-a" /></main>;
}
createRoot(document.getElementById('root')!).render(<I18nProvider><ToastProvider><Fixture /></ToastProvider></I18nProvider>);
