import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../lib/i18n/context';
import { en } from '../lib/i18n/en';
import { bs } from '../lib/i18n/bs';
const h=vi.hoisted(()=>({ role:'director',failRead:false,get:vi.fn(),patch:vi.fn(),refresh:vi.fn() }));
vi.mock('../lib/apiClient',()=>({default:{get:(...args:unknown[])=>h.get(...args),patch:(...args:unknown[])=>h.patch(...args)}}));
vi.mock('../context/AppContext',()=>({useApp:()=>({userContext:{role:h.role},refreshUserContext:h.refresh})}));
vi.mock('../api/messageTemplates',()=>({getMessageTemplates:async()=>[],createMessageTemplate:vi.fn(),updateMessageTemplate:vi.fn(),archiveMessageTemplate:vi.fn()}));
vi.mock('../icons',()=>({DocsIcon:()=>null}));
vi.mock('../components/common/PageMeta',()=>({default:()=>null}));
import Settings from '../pages/admin/Settings';
const org={name:'Synthetic Agency',slug:'synthetic-agency',currency:'BAM',timezone:'Europe/Sarajevo',email:'',phone:'',address:'',tax_id:'',bank_account:'',invoice_footer:'',email_sender_name:'',email_sender_address:'',sms_sender_name:'',sms_sender_number:''};
const plan={plan:'trial',planLabel:'Trial',entitledModules:['dashboard'],tiers:[{key:'trial',label:'Trial',modules:['dashboard']},{key:'enterprise',label:'Enterprise',modules:['dashboard','documents']}]};
beforeEach(()=>{
 h.role='director';h.failRead=false;h.get.mockReset();h.patch.mockReset();h.refresh.mockReset();
 h.get.mockImplementation(async(url:string)=>{
  if(url==='/settings'){if(h.failRead)throw new Error('Synthetic settings read failure');return{data:org};}
  if(url==='/settings/plan')return{data:plan};
  if(url==='/settings/agency-profile')return{data:{profiles:['retail_agency'],capabilities:['customer_sales'],configured:true}};
  return{data:{}};
 });h.patch.mockImplementation(async(path:string)=>({data:path==='/settings/plan'?{...plan,plan:'enterprise',planLabel:'Enterprise'}:org}));localStorage.clear();
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function show(lang:'bs'|'en'='en'){localStorage.setItem('travline_lang',lang);return render(<MemoryRouter><I18nProvider><Settings/></I18nProvider></MemoryRouter>);}
describe('commercial settings save and entitlement safety',()=>{
 it.each(['bs','en'] as const)('does not present failed initial reads as editable blank settings (%s)',async lang=>{
  h.failRead=true;show(lang);const t=lang==='bs'?bs:en;
  expect(await screen.findByText(t.settings.organizationLoadError)).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:t.settings.saveOrganizationSettings})).not.toBeInTheDocument();
  expect(h.patch).not.toHaveBeenCalled();h.failRead=false;
  fireEvent.click(screen.getByRole('button',{name:t.settings.retryOrganizationLoad}));
  expect(await screen.findByDisplayValue('Synthetic Agency')).toBeInTheDocument();
 });
 it.each(['bs','en'] as const)('keeps agency entitlement controls read-only (%s)',async lang=>{
  show(lang);const t=lang==='bs'?bs:en;
  expect(await screen.findByText(t.settings.planManagedByPlatform)).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:t.settings.planUpgrade})).not.toBeInTheDocument();
  expect(h.patch).not.toHaveBeenCalled();
 });
 it('retains typed settings and serializes duplicate submissions through a failed save and retry',async()=>{
  show();const input=await screen.findByDisplayValue('Synthetic Agency');fireEvent.change(input,{target:{value:'Synthetic edited name'}});
  let rejectSave!:(error:unknown)=>void;
  h.patch.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectSave=reject;}));
  const save=screen.getByRole('button',{name:en.settings.saveOrganizationSettings});fireEvent.click(save);fireEvent.click(save);
  expect(h.patch).toHaveBeenCalledTimes(1);await act(async()=>rejectSave(new Error('Synthetic save failed')));
  expect(screen.getByDisplayValue('Synthetic edited name')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:en.settings.saveOrganizationSettings}));await waitFor(()=>expect(h.patch).toHaveBeenCalledTimes(2));
  expect(h.patch).toHaveBeenLastCalledWith('/settings',expect.objectContaining({name:'Synthetic edited name'}));
 });
 it.each(['bs','en'] as const)('localizes blocked saves without exposing diagnostics (%s)',async lang=>{
  show(lang);const t=lang==='bs'?bs:en;await screen.findByDisplayValue('Synthetic Agency');
  h.patch.mockRejectedValueOnce({message:'synthetic-private-diagnostic',response:{data:{code:'MIGRATION_PENDING'}}});
  fireEvent.click(screen.getByRole('button',{name:t.settings.saveOrganizationSettings}));
  expect(await screen.findByText(t.settings.organizationMigrationRequired)).toBeInTheDocument();
  expect(screen.queryByText('synthetic-private-diagnostic')).not.toBeInTheDocument();
 });
 it('keeps authorized platform entitlement assignment available',async()=>{
  h.role='super_admin';vi.spyOn(window,'confirm').mockReturnValue(true);show();
  const change=await screen.findByRole('button',{name:en.settings.planUpgrade});fireEvent.click(change);
  await waitFor(()=>expect(h.patch).toHaveBeenCalledWith('/settings/plan',{plan:'enterprise'}));
 });
});
