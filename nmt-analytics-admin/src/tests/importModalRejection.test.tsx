import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../lib/i18n/context';
const post = vi.fn();
vi.mock('../lib/apiClient', () => ({ default:{post:(...args:unknown[])=>post(...args)}, get:vi.fn() }));
import ImportModal from '../components/import/ImportModal';
const valid={total:2,validCount:2,invalidCount:0,invalidRows:[],preview:[{full_name:'Synthetic customer'}]};
const invalid={total:2,validCount:1,invalidCount:1,invalidRows:[{row:2,errors:['email is invalid']}]};
function open(){const onSuccess=vi.fn();render(<I18nProvider><ImportModal entity="customers" isOpen onClose={()=>{}} onSuccess={onSuccess}/></I18nProvider>);fireEvent.change(screen.getByLabelText('Select CSV or XLSX file'),{target:{files:[new File(['fullName,phone\nSynthetic customer,061123456'],'c.csv',{type:'text/csv'})]}});return onSuccess;}
beforeEach(()=>{post.mockReset();localStorage.setItem('travline_lang','en');});
describe('ImportModal rejected file',()=>{
 it('shows invalid preview rows and never enables a write',async()=>{
  post.mockResolvedValueOnce({data:{success:true,dryRun:true,results:invalid}});const onSuccess=open();await screen.findByText(/Row 2:.*email is invalid/);expect(screen.getByRole('button',{name:'Import',exact:true})).toBeDisabled();expect(post).toHaveBeenCalledTimes(1);expect(onSuccess).not.toHaveBeenCalled();
 });
 it('retains rejected save details and never reports success',async()=>{
  post.mockResolvedValueOnce({data:{success:true,dryRun:true,results:valid}}).mockRejectedValueOnce({response:{data:{code:'IMPORT_VALIDATION_FAILED',message:'Nothing was imported',results:invalid}}});const onSuccess=open();const submit=screen.getByRole('button',{name:'Import',exact:true});await waitFor(()=>expect(submit).toBeEnabled());fireEvent.click(submit);await screen.findByText(/Row 2:.*email is invalid/);expect(screen.getByRole('alert')).toHaveTextContent('Nothing was imported');expect(onSuccess).not.toHaveBeenCalled();expect(submit).toBeDisabled();
 });
});
