import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import DepartureFormModal from '../../src/components/departures/DepartureFormModal';
import type {Departure} from '../../src/api/departures';
import type {Package,TravelerRequirements} from '../../src/api/packages';
import {I18nProvider} from '../../src/lib/i18n';
import {ThemeProvider} from '../../src/context/ThemeContext';
import '../../src/index.css';
const winter=new URLSearchParams(location.search).has('winter');
const record={id:'synthetic-departure',package_id:'synthetic-package',depart_at:winter?'2027-01-15T07:00:00Z':'2027-07-15T07:00:00Z',return_at:winter?'2027-01-15T20:00:00Z':'2027-07-15T20:00:00Z',capacity:8,booked:0,status:'active',transport_type:'bus'} as Departure;
export function Fixture(){
 const [saved,setSaved]=useState('');const [mode,setMode]=useState<'inherit'|'override'>('inherit');const [req,setReq]=useState<TravelerRequirements>({documentType:'none'});
 return <main className="min-h-screen bg-white dark:bg-gray-950 dark:text-white"><output aria-label="Saved departure">{saved}</output>
 <DepartureFormModal isOpen onClose={()=>{}} title="Edit synthetic departure" packages={[{id:'synthetic-package',name:'Synthetic package',destination:'Mostar'} as Package]} editingDeparture={record} loading={false} travelerMode={mode} setTravelerMode={setMode} travelerReq={req} setTravelerReq={setReq} onSubmit={async data=>setSaved(data.departAt)} />
 </main>;
}
createRoot(document.getElementById('root')!).render(<I18nProvider><ThemeProvider><Fixture/></ThemeProvider></I18nProvider>);
