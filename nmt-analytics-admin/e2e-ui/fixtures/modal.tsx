import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from '../../src/components/ui/modal';
import { I18nProvider, useT } from '../../src/lib/i18n';
import { ThemeProvider, useTheme } from '../../src/context/ThemeContext';
import '../../src/index.css';
export function Fixture() {
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  const [submits, setSubmits] = useState(0);
  const { toggleTheme } = useTheme();
  const { toggleLang } = useT();
  return <main className="min-h-screen bg-white p-4 text-gray-900 dark:bg-gray-950 dark:text-white">
    <button onClick={toggleTheme}>Theme</button><button onClick={toggleLang}>Language</button>
    <button onClick={() => setOpen(true)}>Open form</button><a href="#background">Background link</a>
    <output aria-label="Submissions">{submits}</output>
    <form onSubmit={e => { e.preventDefault(); setSubmits(n => n + 1); }}>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Audit form" className="m-4 max-w-xl">
        <div className="space-y-4 p-6">
          {Array.from({length: 16}, (_, i) => <label className="block" key={i}>Field {i + 1}<input className="block w-full border dark:bg-gray-900" defaultValue={`Synthetic ${i + 1}`} /></label>)}
          <button type="button" onClick={() => setNested(true)}>Open nested</button>
          <button type="submit">Save</button>
        </div>
      </Modal>
      <Modal isOpen={nested} onClose={() => setNested(false)} title="Nested form" className="m-4 max-w-sm"><input aria-label="Nested value" /></Modal>
    </form>
  </main>;
}
createRoot(document.getElementById('root')!).render(<I18nProvider><ThemeProvider><Fixture /></ThemeProvider></I18nProvider>);
