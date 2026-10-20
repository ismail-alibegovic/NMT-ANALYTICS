import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PaymentForm from '../components/payments/PaymentForm';
import { localPaymentDate } from '../utils/paymentDate';
import { I18nProvider } from '../lib/i18n/context';
afterEach(()=>{cleanup();localStorage.clear();vi.useRealTimers();});
function mount(props:Partial<React.ComponentProps<typeof PaymentForm>>={}) {
 return render(<I18nProvider><PaymentForm currency="BAM" onSubmit={async()=>{}} onCancel={()=>{}} onBusyChange={()=>{}} {...props}/></I18nProvider>);
}
describe('shared payment form',()=>{
 it('preserves the draft across parent rerenders',()=>{
  const view=mount({initial:{amount:30}});fireEvent.change(screen.getByLabelText('Amount *'),{target:{value:'45'}});
  view.rerender(<I18nProvider><PaymentForm currency="BAM" initial={{amount:30}} onSubmit={async()=>{}} onCancel={()=>{}} onBusyChange={()=>{}}/></I18nProvider>);
  expect(screen.getByLabelText('Amount *')).toHaveValue(45);
 });
 it('serializes same-tick submits and retains fields after failure',async()=>{
  let reject!:(reason:Error)=>void;const submit=vi.fn(()=>new Promise<void>((_r,j)=>{reject=j;}));const busy=vi.fn();
  mount({initial:{amount:45},onSubmit:submit,onBusyChange:busy});const form=screen.getByRole('form');fireEvent.submit(form);fireEvent.submit(form);
  expect(submit).toHaveBeenCalledTimes(1);expect(screen.getByLabelText('Status')).toBeDisabled();expect(screen.getByLabelText('Method')).toBeDisabled();
  reject(new Error('failure'));await screen.findByRole('alert');expect(screen.getByLabelText('Amount *')).toHaveValue(45);expect(busy.mock.calls).toEqual([[true],[false]]);
 });
 it.each(['Infinity','0','-1','0.001'])('rejects invalid amount %s before sending',async value=>{
  const submit=vi.fn();mount({onSubmit:submit});fireEvent.change(screen.getByLabelText('Amount *'),{target:{value}});fireEvent.submit(screen.getByRole('form'));await screen.findByRole('alert');expect(submit).not.toHaveBeenCalled();
 });
 it('uses the local calendar date rather than UTC',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,19,0,15));expect(localPaymentDate()).toBe('2026-10-19');
 });
 it('submits the selected status and currency is read only',async()=>{
  const submit=vi.fn().mockResolvedValue(undefined);mount({initial:{amount:30},onSubmit:submit});
  expect(screen.getByLabelText('Currency')).toHaveAttribute('readonly');fireEvent.change(screen.getByLabelText('Status'),{target:{value:'pending'}});fireEvent.submit(screen.getByRole('form'));
  await waitFor(()=>expect(submit).toHaveBeenCalledWith(expect.objectContaining({amount:30,status:'pending'})));
 });
 it('does not invent a payment date when editing a historical undated record',async()=>{
  const submit=vi.fn().mockResolvedValue(undefined);mount({editing:true,initial:{amount:30},onSubmit:submit});
  expect(screen.getByLabelText('Date')).toHaveValue('');fireEvent.submit(screen.getByRole('form'));
  await waitFor(()=>expect(submit).toHaveBeenCalledWith(expect.objectContaining({payment_date:undefined})));
 });

});
