import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../../src/lib/i18n/context';
import LanguageToggleButton from '../../src/components/common/LanguageToggleButton';
import { DataTable } from '../../src/components/ui/DataTable';
import '../../src/index.css';
if (import.meta.env.MODE !== 'form-contract') throw new Error('Isolated form test server required');
export default function Fixture() {
  const [rows, setRows] = useState(false);
  const [broken, setBroken] = useState(false);
  return <main className="min-h-screen bg-white p-4 dark:bg-gray-950 dark:text-white"><LanguageToggleButton />
    <div className="flex flex-wrap gap-3 py-4"><button onClick={() => setRows(true)}>Show synthetic row</button><button onClick={() => setBroken(true)}>Break synthetic cell</button><button onClick={() => setBroken(false)}>Fix synthetic cell</button></div>
    <DataTable data={rows ? [{ name: 'Synthetic recovered row' }] : []} columns={[{ key: 'name', header: 'Synthetic column', render: value => { if (broken) throw new Error('SYNTHETIC_TABLE_RENDER_FAILURE'); return value; } }]} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<I18nProvider><Fixture /></I18nProvider>);
