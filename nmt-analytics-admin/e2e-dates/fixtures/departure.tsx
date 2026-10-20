import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import DepartureFormModal from '../../src/components/departures/DepartureFormModal';
import type {Departure} from '../../src/api/departures';
import type {Package,TravelerRequirements} from '../../src/api/packages';
import {I18nProvider} from '../../src/lib/i18n';
import {ThemeProvider} from '../../src/context/ThemeContext';
import '../../src/index.css';
const params = new URLSearchParams(location.search);
const winter=params.has('winter'), precise=params.has('precise'), fold=params.has('fold'), remote=params.has('transport');
const record={id:'synthetic-departure',package_id:'synthetic-package',depart_at:fold?'2027-10-31T01:30:37.123Z':precise?'2027-07-15T07:00:37.123Z':winter?'2027-01-15T07:00:00Z':'2027-07-15T07:00:00Z',return_at:fold?'2027-10-31T20:00:42.456Z':precise?'2027-07-15T20:00:42.456Z':winter?'2027-01-15T20:00:00Z':'2027-07-15T20:00:00Z',capacity:8,booked:0,status:'active',transport_type:'bus'} as Departure;
export function Fixture(){
 const [saved,setSaved]=useState('');const [savedReturn,setSavedReturn]=useState('');const [closes,setCloses]=useState(0);const [mode,setMode]=useState<'inherit'|'override'>('inherit');const [req,setReq]=useState<TravelerRequirements>({documentType:'none'});
 return <main className="min-h-screen bg-white dark:bg-gray-950 dark:text-white"><output aria-label="Saved departure">{saved}</output><output aria-label="Saved return">{savedReturn}</output><output aria-label="Close requests">{closes}</output>
 <DepartureFormModal isOpen onClose={()=>setCloses(value=>value+1)} title="Edit synthetic departure" packages={[{id:'synthetic-package',name:'Synthetic package',destination:'Mostar'} as Package]} editingDeparture={record} loading={false} travelerMode={mode} setTravelerMode={setMode} travelerReq={req} setTravelerReq={setReq} onSubmit={async data=>{
  if(remote){const result=await fetch('/synthetic-departure-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!result.ok)throw new Error('Synthetic departure rejection');}
  setSaved(data.departAt);setSavedReturn(data.returnAt);
 }} />
 </main>;
}
createRoot(document.getElementById('root')!).render(<I18nProvider><ThemeProvider><Fixture/></ThemeProvider></I18nProvider>);
