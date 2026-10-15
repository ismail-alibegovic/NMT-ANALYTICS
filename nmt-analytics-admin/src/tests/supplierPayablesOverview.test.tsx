import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { render } from './renderWithI18n';
import SupplierPayablesOverview from '../components/finance/SupplierPayablesOverview';
import { en } from '../lib/i18n/en'; import { bs } from '../lib/i18n/bs';
const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../api/supplierPayables', () => ({ getSupplierPayablesOverview: api.get }));
const data = { asOfDate: '2026-10-15', timezone: 'Europe/Sarajevo', totalCount: 26, page: 1, pageSize: 25,
  suppliers: [{ id: 'supplier', name: 'Bus partner' }],
  currencies: [{ currency: 'BAM', count: 25, outstanding: 40, overdue: 40, dueToday: 0 }, { currency: 'EUR', count: 1, outstanding: 20, overdue: 0, dueToday: 20 }],
  payables: [{ id: 'payable', departureId: 'departure', supplierId: 'supplier', supplierName: 'Bus partner', label: 'Bus cost', amount: 100, currency: 'BAM', paid: 60, remaining: 40, dueDate: '2026-10-14', status: 'partial', overdue: true }],
};
function show() { return render(<MemoryRouter><SupplierPayablesOverview /></MemoryRouter>); }
beforeEach(() => { vi.resetAllMocks(); localStorage.setItem('travline_lang','en'); api.get.mockResolvedValue(data); });
for (const [lang,t] of [['bs',bs],['en',en]] as const) it(`shows currency-separated summary and departure links in ${lang}`, async () => {
  localStorage.setItem('travline_lang',lang); show(); const c=t.supplierPayablesOverview;
  expect(await screen.findByText(c.scope,{ exact:false })).toBeInTheDocument();
  expect(screen.getAllByText(lang==='bs'?'20,00 EUR':'20.00 EUR')).toHaveLength(2);
  expect(screen.getByRole('link',{name:c.openDeparture})).toHaveAttribute('href','/departures/departure?tab=finance');
  expect(screen.getByText(`${c.page} 1 / 2 · ${c.count}: 26`)).toBeInTheDocument();
});
it('paginates then resets to first page when supplier/status changes', async () => {
  show(); await screen.findByText('Bus cost'); fireEvent.click(screen.getByRole('button',{name:en.supplierPayablesOverview.next}));
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith({supplierId:'',status:'open',page:2}));
  fireEvent.change(screen.getByLabelText(en.supplierPayables.supplier),{target:{value:'supplier'}});
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith({supplierId:'supplier',status:'open',page:1}));
  fireEvent.change(screen.getByLabelText(en.supplierPayablesOverview.filter),{target:{value:'overdue'}});
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith({supplierId:'supplier',status:'overdue',page:1}));
});
it('hides old money on a failed refresh and provides a working retry', async () => {
  show(); await screen.findByText('Bus cost'); api.get.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button',{name:en.supplierPayablesOverview.refresh}));
  await screen.findByRole('alert'); expect(screen.queryByText('Bus cost')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:en.supplierPayablesOverview.retry})); await screen.findByText('Bus cost');
});
it('ignores a slow response from an obsolete filter', async () => {
  let resolve!: (value:typeof data)=>void; api.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;})); show();
  fireEvent.change(screen.getByLabelText(en.supplierPayablesOverview.filter),{target:{value:'overdue'}});
  await screen.findByText('Bus cost'); await act(async()=>resolve({...data,payables:[],currencies:[],totalCount:0}));
  expect(screen.getByText('Bus cost')).toBeInTheDocument();
});
it('renders a confirmed empty result', async () => {
  api.get.mockResolvedValue({...data,payables:[],currencies:[],totalCount:0}); show();
  await screen.findByText(en.supplierPayablesOverview.empty); expect(screen.getByRole('button',{name:en.supplierPayablesOverview.next})).toBeDisabled();
});
