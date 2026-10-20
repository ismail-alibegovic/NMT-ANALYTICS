import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FormModal} from '../../src/components/ui/FormModal';
import {I18nProvider} from '../../src/lib/i18n';
import {ThemeProvider} from '../../src/context/ThemeContext';
import {ToastProvider} from '../../src/context/ToastContext';
import '../../src/index.css';
export function Fixture(){
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [saved,setSaved]=useState('');
 return <main className="min-h-screen bg-white p-4 dark:bg-gray-950 dark:text-white">
 <button onClick={()=>setOpen(true)}>Edit record</button><output aria-label="Saved">{saved}</output>
 <FormModal isOpen={open} title="Edit synthetic record" onClose={()=>setOpen(false)} loading={busy}
  fields={[{name:'name',label:'Name',type:'text',required:true},{name:'status',label:'Status',type:'select',required:true,options:[{value:'active',label:'Active'},{value:'lead',label:'Lead'}]}]}
  initialData={{name:'Original',status:'active'}} submitButtonText="Save"
  onSubmit={async data=>{
   setBusy(true);
   try{
    const response=await fetch('/synthetic-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(!response.ok)throw new Error('Synthetic save rejected');
    setSaved(data.name);
   }finally{setBusy(false);}
  }} />
 </main>;
}
createRoot(document.getElementById('root')!).render(<I18nProvider><ThemeProvider><ToastProvider><Fixture /></ToastProvider></ThemeProvider></I18nProvider>);
