import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router';
import DepartureAccommodationAllotment from '../../src/components/departures/DepartureAccommodationAllotment';
import ManualBusSeating from '../../src/components/operations/ManualBusSeating';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { ToastProvider } from '../../src/context/ToastContext';
import { I18nProvider } from '../../src/lib/i18n/context';
import { setFixtureRole } from './app-context';
import '../../src/index.css';

if (import.meta.env.MODE !== 'form-contract') throw Error('Isolated test server required');
setFixtureRole('manager');
const mode = new URLSearchParams(location.search).get('mode') || 'allotment';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <I18nProvider>
        <MemoryRouter>
          <ThemeProvider>
            <ToastProvider>
              <main className="mx-auto max-w-5xl p-4">
                {mode === 'vehicle' ? (
                  <ManualBusSeating departureId="dep-bus-1" transportType="bus" passengers={[]} />
                ) : (
                  <DepartureAccommodationAllotment departureId="dep-bus-1" />
                )}
              </main>
            </ToastProvider>
          </ThemeProvider>
        </MemoryRouter>
      </I18nProvider>
    </HelmetProvider>
  </StrictMode>,
);
