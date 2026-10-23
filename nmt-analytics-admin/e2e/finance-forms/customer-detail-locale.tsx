import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router';
import { HelmetProvider } from 'react-helmet-async';
import { I18nProvider } from '../../src/lib/i18n/context';
import { ToastProvider } from '../../src/context/ToastContext';
import LanguageToggleButton from '../../src/components/common/LanguageToggleButton';
import CustomerDetail from '../../src/pages/CustomerDetail';
import '../../src/index.css';

if (import.meta.env.MODE !== 'form-contract') throw new Error('Isolated form test server required');
export default function Fixture() {
  return <main className="min-h-screen bg-white p-4 text-gray-900 dark:bg-gray-950 dark:text-white">
    <LanguageToggleButton />
    <MemoryRouter initialEntries={['/customers/customer-a']}><Routes>
      <Route path="/customers/:id" element={<CustomerDetail />} />
    </Routes></MemoryRouter>
  </main>;
}
createRoot(document.getElementById('root')!).render(<HelmetProvider><I18nProvider><ToastProvider><Fixture /></ToastProvider></I18nProvider></HelmetProvider>);
