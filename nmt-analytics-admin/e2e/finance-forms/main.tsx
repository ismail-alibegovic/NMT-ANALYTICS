import { HelmetProvider } from 'react-helmet-async';
import PublicSubAgentPortal from '../../src/pages/PublicSubAgentPortal';
import SubAgents from '../../src/pages/operations/SubAgents';
import Suppliers from '../../src/pages/Suppliers';
import Reports from '../../src/pages/Reports';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../../src/lib/i18n/context';
import { ToastProvider } from '../../src/context/ToastContext';
import AddPaymentModal from '../../src/components/payments/AddPaymentModal';
import EditPaymentModal from '../../src/components/payments/EditPaymentModal';
import PaymentsModal from '../../src/components/payments/PaymentsModal';
import type { Payment } from '../../src/api/payments';
import '../../src/index.css';
if (import.meta.env.MODE !== 'form-contract') throw new Error('Isolated finance form test server required');
const payment: Payment = { id:'00000000-0000-4000-8000-000000000022', reservationId:'00000000-0000-4000-8000-000000000011',amount:30,currency:'BAM',status:'succeeded',paymentDate:'2026-10-19',paymentMethod:'cash',createdAt:'2026-10-19' };
export default function Harness() {
 const [open,setOpen]=useState(false);
 const surface=new URLSearchParams(location.search).get('surface');
 if(surface==='portal') return <PublicSubAgentPortal/>;
 if(surface==='subagents') return <SubAgents/>;
 if(surface==='suppliers') return <Suppliers/>;
 if(surface==='reports') return <main className="min-h-screen bg-gray-50 p-4 text-gray-900 dark:bg-gray-950"><Reports/></main>;
 const props={isOpen:open,onClose:()=>setOpen(false)};
 return <main className="min-h-screen bg-gray-50 p-4 text-gray-900 dark:bg-gray-950"><button onClick={()=>setOpen(true)}>Open form</button>{surface==='edit'?<EditPaymentModal {...props} payment={payment}/>:surface==='list'?<PaymentsModal {...props} reservationId={payment.reservationId} reservationTotal={180}/>:<AddPaymentModal {...props} reservationId={payment.reservationId}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<HelmetProvider><I18nProvider><ToastProvider><Harness/></ToastProvider></I18nProvider></HelmetProvider>);
