import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router';
import { I18nProvider, useT } from '../../src/lib/i18n/context';
import { ToastProvider } from '../../src/context/ToastContext';
import RoomingWorkspace from '../../src/components/operations/RoomingWorkspace';
import CreateReservationModal from '../../src/components/reservations/CreateReservationModal';
import Calendar from '../../src/pages/operations/Calendar';
import '../../src/index.css';

if (import.meta.env.MODE !== 'form-contract') throw new Error('Isolated form test server required');

function ParityHarness() {
  const { toggleLang, t } = useT();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <main className="min-h-screen space-y-6 bg-white p-4 dark:bg-gray-950">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggleLang}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-gray-200"
        >
          {t.settings.language}
        </button>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white"
        >
          {t.createReservationModal.title}
        </button>
      </div>
      <RoomingWorkspace
        departureId="dep-1"
        passengers={[{ id: 'pax-2', passengerId: 'pax-2', fullName: 'Emir Kovač' }] as any}
      />
      <Calendar />
      <CreateReservationModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSuccess={() => {}} />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <HelmetProvider>
    <MemoryRouter>
      <I18nProvider>
        <ToastProvider>
          <ParityHarness />
        </ToastProvider>
      </I18nProvider>
    </MemoryRouter>
  </HelmetProvider>,
);
