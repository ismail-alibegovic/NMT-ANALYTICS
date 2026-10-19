import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import Input from '../components/form/input/InputField';
import Select from '../components/form/Select';
import PageToolbar from '../components/ui/PageToolbar';
import Label from '../components/form/Label';
import { Modal } from '../components/ui/modal';
import { FormModal } from '../components/ui/FormModal';
import { I18nProvider } from '../lib/i18n/context';
import { ToastProvider } from '../context/ToastContext';

vi.mock('../context/ToastContext', () => ({useToast:()=>({success:vi.fn(),error:vi.fn()}),ToastProvider:({children}:{children:React.ReactNode})=><>{children}</>}));

vi.mock('../icons', () => ({ ChevronDownIcon: () => <svg /> }));

const providers = ({ children }: { children: React.ReactNode }) => <I18nProvider><ToastProvider>{children}</ToastProvider></I18nProvider>;

describe('shared form control contracts', () => {
  it('forwards native validation and accessible error descriptions without dropping caller hints', () => {
    render(<><Label htmlFor="iata">Airport</Label><p id="help">IATA code</p><Input id="iata" required maxLength={3} pattern="[A-Z]{3}" error hint="Use three letters" aria-describedby="help" /></>);
    const input = screen.getByLabelText('Airport');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('maxlength', '3');
    expect(input).toHaveAttribute('pattern', '[A-Z]{3}');
    expect(input).toHaveAccessibleDescription('IATA code Use three letters');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
  it('controlled select reflects external resets and reports native validation', () => {
    const onChange = vi.fn();
    const options = [{value:'BAM', label:'BAM'}, {value:'EUR', label:'EUR'}];
    const { rerender } = render(<Select id="currency" options={options} value="BAM" onChange={onChange} required error aria-describedby="error" />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, {target:{value:'EUR'}});
    expect(onChange).toHaveBeenCalledWith('EUR');
    rerender(<Select id="currency" options={options} value="BAM" onChange={onChange} required error />);
    expect(select).toHaveValue('BAM');
    expect(select).toBeRequired();
    expect(select).toHaveAttribute('aria-invalid','true');
  });
  it('modal names the dialog, preserves opt-in scrolling and closes with Escape', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="Flight" scrollable closeLabel="Zatvori"><p>Fields</p></Modal>);
    expect(screen.getByRole('dialog', { name: 'Flight' })).toHaveClass('overflow-y-auto');
    expect(screen.getByRole('button', { name: 'Zatvori' })).toHaveAttribute('type','button');
    fireEvent.keyDown(document, {key:'Escape'});
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('FormModal shared workflow', () => {
  const fields = [{name:'full_name',label:'Name',type:'text' as const,required:true}, {name:'amount',label:'Amount',type:'number' as const,required:true}, {name:'status',label:'Status',type:'select' as const,options:[{value:'active',label:'Active'}]}];
  it('does not reset drafts when initialData is omitted, and associates select labels', () => {
    render(<FormModal isOpen title="Customer" fields={fields} onClose={vi.fn()} onSubmit={vi.fn()} />, {wrapper:providers});
    fireEvent.change(screen.getByLabelText(/Name/),{target:{value:'Draft customer'}});
    expect(screen.getByLabelText(/Name/)).toHaveValue('Draft customer');
    expect(screen.getByLabelText('Status')).toHaveAttribute('id');
  });
  it('keeps zero, validates whitespace in the selected language, and exposes errors', async () => {
    localStorage.setItem('travline_lang','en');
    const onSubmit=vi.fn();
    render(<FormModal isOpen title="Customer" fields={fields} initialData={{full_name:'   ',amount:0}} onClose={vi.fn()} onSubmit={onSubmit} />, {wrapper:providers});
    expect(screen.getByLabelText(/Amount/)).toHaveValue(0);
    fireEvent.click(screen.getByRole('button',{name:'Save'}));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText('Name is required')).toHaveAttribute('role','alert');
    expect(screen.getByLabelText(/Name/)).toHaveAccessibleDescription('Name is required');
  });
  it('keeps failed drafts and prevents duplicate submits or closing while pending', async () => {
    let reject!: (e: Error) => void;
    const onSubmit=vi.fn(() => new Promise<void>((_resolve, rej)=>{reject=rej}));
    const onClose=vi.fn();
    const initialData={full_name:'Draft customer',amount:0,status:'active'};
    render(<FormModal isOpen title="Customer" fields={fields} initialData={initialData} onClose={onClose} onSubmit={onSubmit} />, {wrapper:providers});
    const form=screen.getByLabelText(/Name/).closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document,{key:'Escape'});
    expect(onClose).not.toHaveBeenCalled();
    reject(new Error('Isolated failure'));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Save'})).toBeEnabled());
    expect(screen.getByLabelText(/Name/)).toHaveValue('Draft customer');
  });
  it('preserves a draft across a parent rerender with equal inline initial values', () => {
    const props = {isOpen:true,title:'Customer',fields,onClose:vi.fn(),onSubmit:vi.fn()};
    const { rerender } = render(<FormModal {...props} initialData={{full_name:'Original'}} />, {wrapper:providers});
    fireEvent.change(screen.getByLabelText(/Name/),{target:{value:'Unsaved'}});
    rerender(<FormModal {...props} initialData={{full_name:'Original'}} loading />);
    expect(screen.getByLabelText(/Name/)).toHaveValue('Unsaved');
  });
  it('cancel/reopen loads initial data rather than the abandoned draft', () => {
    function Wrapper() {
      const [open,setOpen]=useState(true);
      return <><button onClick={()=>setOpen(true)}>Open</button><FormModal isOpen={open} title="Customer" fields={fields} initialData={{full_name:'Original',amount:0}} onClose={()=>setOpen(false)} onSubmit={vi.fn()} /></>;
    }
    render(<Wrapper />, {wrapper:providers});
    fireEvent.change(screen.getByLabelText(/Name/),{target:{value:'Abandoned'}});
    fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
    fireEvent.click(screen.getByRole('button',{name:'Open'}));
    expect(screen.getByLabelText(/Name/)).toHaveValue('Original');
  });
});

it('names toolbar search/filter controls and preserves filter selection behavior', () => {
  const onChange=vi.fn();
  render(<PageToolbar title="Flights" searchPlaceholder="Search flights" onSearchChange={vi.fn()} filters={[{key:'status',label:'Status',value:'',onChange,options:[{value:'active',label:'Active'}]}]} />);
  expect(screen.getByRole('textbox',{name:'Search flights'})).toBeVisible();
  fireEvent.change(screen.getByRole('combobox',{name:'Status'}),{target:{value:'active'}});
  expect(onChange).toHaveBeenCalledWith('active');
});
