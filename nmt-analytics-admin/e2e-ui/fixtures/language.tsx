import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, useT } from '../../src/lib/i18n/context';
import LanguageToggleButton from '../../src/components/common/LanguageToggleButton';
import '../../src/index.css';

export default function Fixture() {
  const [submits, setSubmits] = useState(0);
  const { t } = useT();
  return <main className="min-h-screen bg-white p-4 text-gray-900 dark:bg-gray-950 dark:text-white">
    <form onSubmit={event => { event.preventDefault(); setSubmits(count => count + 1); }}>
      <LanguageToggleButton />
      <output aria-label="Save translation">{t.common.save}</output>
      <output aria-label="Submissions">{submits}</output>
    </form>
  </main>;
}
createRoot(document.getElementById('root')!).render(<I18nProvider><Fixture /></I18nProvider>);
