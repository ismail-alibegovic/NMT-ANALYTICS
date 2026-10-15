import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import Button from '../ui/button/Button';
import { Modal } from '../ui/modal';
import { bookQuotation, getQuotation, getQuotationBookingOptions, type Quotation, type QuotationBookingDeparture } from '../../api/quotations';
import { useT } from '../../lib/i18n/context';

export default function QuotationBookingPanel({quotation:q}:{quotation:Quotation}){
  const {t}=useT();const c=t.quotations;
  const [saved,setSaved]=useState(q.booking || null);
  const [open,setOpen]=useState(false);const [loading,setLoading]=useState(false);const [saving,setSaving]=useState(false);
  const [choices,setChoices]=useState<QuotationBookingDeparture[]>([]);
  const [departureId,setDepartureId]=useState('');const [name,setName]=useState(q.bookingContext?.contactName || '');
  const [phone,setPhone]=useState(q.bookingContext?.phone || '');const [email,setEmail]=useState(q.bookingContext?.email || '');
  const [names,setNames]=useState('');const [error,setError]=useState('');
  const travelers=q.bookingContext?.travelers || 0;
  const message=useCallback((code?:string)=>{
    if(code==='DEPARTURE_CAPACITY_EXCEEDED')return c.bookingCapacity;
    if(code==='QUOTATION_ALREADY_BOOKED')return c.bookingAlready;
    if(code==='INSUFFICIENT_PERMISSIONS')return c.bookingForbidden;
    if(code==='QUOTATION_DEPARTURE_INCOMPATIBLE')return c.bookingIncompatible;
    if(code==='QUOTATION_TRAVELERS_INVALID')return c.bookingNamesMismatch.replace('{count}',String(travelers));
    return c.bookingError;
  },[c,travelers]);
  useEffect(()=>{
    if(!open)return;
    let current=true;setLoading(true);setError('');setChoices([]);setDepartureId('');
    getQuotationBookingOptions(q.id).then(rows=>{if(current)setChoices(rows);})
      .catch(e=>{if(current)setError(message(e?.code));})
      .finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[open,q.id,message]);
  async function save(){
    const passengers=names.split('\n').map(n=>n.trim()).filter(Boolean).map(full_name=>({full_name}));
    if(passengers.length!==travelers){setError(c.bookingNamesMismatch.replace('{count}',String(travelers)));return;}
    setSaving(true);setError('');
    try{
      const result=await bookQuotation(q.id,{departureId,customerName:name.trim(),customerPhone:phone.trim(),customerEmail:email.trim() || null,passengers});
      setSaved({id:result.reservation.id,status:result.reservation.status,creation_state:'completed'});setOpen(false);
    }catch(e:any){
      setError(message(e?.code));
      if(e?.code==='QUOTATION_ALREADY_BOOKED'){
        try{const fresh=await getQuotation(q.id);if(fresh.booking){setSaved(fresh.booking);setOpen(false);}}catch{/* Keep the original actionable error. */}
      }
    }finally{setSaving(false);}
  }
  if(saved)return <section className="mb-5 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
    <p className="text-sm text-gray-600 dark:text-gray-300">{c.bookingSaved}</p>
    <Link to={`/reservations/${saved.id}`} className="mt-2 inline-block font-medium text-brand-600 dark:text-brand-400">{c.openBooking}</Link>
  </section>;
  if(q.status!=='accepted')return null;
  if(q.bookingContext?.source!=='itinerary' || !q.bookingContext.travelStart || !q.bookingContext.travelEnd || travelers<1)
    return <p className="mb-5 text-sm text-gray-500">{c.bookingReview}</p>;
  return <section className="mb-5 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
    <Button onClick={()=>setOpen(true)}>{c.bookQuote}</Button>
    <p className="mt-2 text-sm text-gray-500">{c.bookingOperational}</p>
    <Modal isOpen={open} onClose={()=>{if(!saving)setOpen(false);}} className="m-4 max-w-xl" title={c.bookQuote}>
      <form onSubmit={e=>{e.preventDefault();void save();}} className="grid max-h-[80vh] gap-4 overflow-y-auto p-6">
        <p className="font-semibold">{c.sellTotal}: {q.sellTotal.toLocaleString()} {q.currency} · {c.travelers}: {travelers}</p>
        {loading?<p role="status">{c.bookingLoading}</p>:choices.length===0?(!error?<p>{c.bookingNoDepartures}</p>:null):<label className="grid min-w-0 gap-1 text-sm">{c.bookingDeparture}
          <select required value={departureId} onChange={e=>setDepartureId(e.target.value)} className="min-w-0 w-full rounded-lg border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-900">
            <option value="">{c.bookingSelectDeparture}</option>
            {choices.map(d=><option key={d.id} value={d.id}>{d.packageName} · {q.bookingContext?.travelStart} – {q.bookingContext?.travelEnd}</option>)}
          </select>
        </label>}
        <label className="grid min-w-0 gap-1 text-sm">{c.contactName}<input required maxLength={200} value={name} onChange={e=>setName(e.target.value)} className="min-w-0 w-full rounded-lg border p-2 dark:border-gray-700 dark:bg-gray-900"/></label>
        <label className="grid min-w-0 gap-1 text-sm">{c.bookingPhone}<input required maxLength={60} value={phone} onChange={e=>setPhone(e.target.value)} className="min-w-0 w-full rounded-lg border p-2 dark:border-gray-700 dark:bg-gray-900"/></label>
        <label className="grid min-w-0 gap-1 text-sm">{c.bookingEmail}<input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="min-w-0 w-full rounded-lg border p-2 dark:border-gray-700 dark:bg-gray-900"/></label>
        <label className="grid min-w-0 gap-1 text-sm">{c.bookingNames}<textarea required rows={4} value={names} onChange={e=>setNames(e.target.value)} className="min-w-0 w-full rounded-lg border p-2 dark:border-gray-700 dark:bg-gray-900"/></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" disabled={saving} onClick={()=>setOpen(false)}>{c.cancel}</Button>
          <Button type="submit" disabled={saving || loading || !departureId || choices.length===0}>{saving?c.saving:c.bookQuote}</Button>
        </div>
      </form>
    </Modal>
  </section>;
}
