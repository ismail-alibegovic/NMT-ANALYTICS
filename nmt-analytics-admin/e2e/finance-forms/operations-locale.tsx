import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router';
import { I18nProvider, useT } from '../../src/lib/i18n/context';
import { ToastProvider } from '../../src/context/ToastContext';
import Excursions from '../../src/pages/operations/Excursions';
import CommissionRules from '../../src/pages/operations/CommissionRules';
import Departures from '../../src/pages/admin/Departures';
import SeatMap from '../../src/components/operations/SeatMap';
import '../../src/index.css';

if (import.meta.env.MODE !== 'form-contract') throw new Error('Isolated test server required');

type Tab = 'excursions' | 'commission' | 'departures' | 'seatmap';

function OperationsLocaleHarness() {
  const { lang, toggleLang } = useT();
  const initialTab = (new URLSearchParams(location.search).get('tab') as Tab) || 'excursions';
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="min-h-screen bg-gray-50 p-4 text-gray-900 dark:bg-gray-950 dark:text-white">
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3 dark:border-gray-800">
        <button type="button" data-testid="toggle-lang" onClick={toggleLang} className="rounded-lg border px-3 py-1.5 text-sm">
          {lang}
        </button>
        <button type="button" onClick={() => setTab('excursions')} className="rounded-lg border px-3 py-1.5 text-sm">tab-excursions</button>
        <button type="button" onClick={() => setTab('commission')} className="rounded-lg border px-3 py-1.5 text-sm">tab-commission</button>
        <button type="button" onClick={() => setTab('departures')} className="rounded-lg border px-3 py-1.5 text-sm">tab-departures</button>
        <button type="button" onClick={() => setTab('seatmap')} className="rounded-lg border px-3 py-1.5 text-sm">tab-seatmap</button>
      </div>
      {tab === 'excursions' && <Excursions />}
      {tab === 'commission' && <CommissionRules />}
      {tab === 'departures' && <Departures />}
      {tab === 'seatmap' && (
        <SeatMap
          capacity={8}
          transportType="bus"
          editable
          passengers={[
            { id: 'pax-1', passengerId: 'pax-1', fullName: 'Synthetic Seat Passenger', seat: null } as any,
          ]}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <I18nProvider>
        <ToastProvider>
          <MemoryRouter>
            <OperationsLocaleHarness />
          </MemoryRouter>
        </ToastProvider>
      </I18nProvider>
    </HelmetProvider>
  </StrictMode>,
);
