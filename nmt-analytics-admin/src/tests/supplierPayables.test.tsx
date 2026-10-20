import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from './renderWithI18n';
import SupplierPayablesPanel from '../components/departures/SupplierPayablesPanel';
import { en } from '../lib/i18n/en'; import { bs } from '../lib/i18n/bs';
import type { SupplierPayable } from '../api/supplierPayables';
import type { DepartureCostItem } from '../api/departures';
const api = vi.hoisted(() => ({ get: vi.fn(), issue: vi.fn(), record: vi.fn(), cancel: vi.fn() }));
vi.mock('../api/supplierPayables', () => ({ getSupplierPayables: api.get, issueSupplierPayable: api.issue, recordSupplierPayableEntry: api.record, cancelSupplierPayable: api.cancel }));
vi.mock('../components/ui/modal', () => ({ Modal: ({ isOpen, children }: any) => isOpen ? <div data-testid="pay-form">{children}</div> : null }));
const cost = { id: 'cost', label: 'Bus supplier cost', supplierId: 'supplier', supplierName: 'Bus company', totalCost: 100, currency: 'BAM' } as DepartureCostItem;
const payable: SupplierPayable = { id: 'payable', requestId: 'issue-request', departureId: 'departure', supplierId: 'supplier', createdAt: '2026-10-15T00:00:00Z', costItemId: cost.id, supplierName: 'Bus company', label: cost.label, amount: 100, currency: 'BAM', dueDate: '2027-07-01', paid: 0, remaining: 100, status: 'unpaid', cancelledAt: null, entries: [] };
const key = 'travline.supplier-ledger.pending.v1.departure';
function show(costs = [cost]) { return render(<SupplierPayablesPanel departureId="departure" costs={costs} onChanged={vi.fn()} />); }
beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear(); localStorage.setItem('travline_lang', 'en'); api.get.mockResolvedValue([]); api.issue.mockResolvedValue({}); api.record.mockResolvedValue({}); api.cancel.mockResolvedValue({}); });
describe('supplier obligation workspace', () => {
  for (const [lang, dictionary] of [['en', en], ['bs', bs]] as const) it(`issues a saved-cost obligation in ${lang}`, async () => {
    localStorage.setItem('travline_lang', lang); const c = dictionary.supplierPayables; show();
    await screen.findByText(c.empty); fireEvent.click(screen.getByRole('button', { name: c.issue }));
    fireEvent.change(screen.getByLabelText(c.costItem), { target: { value: cost.id } });
    fireEvent.change(screen.getByLabelText(c.dueDate), { target: { value: '2027-07-01' } });
    fireEvent.submit(screen.getByTestId('pay-form').querySelector('form')!);
    await waitFor(() => expect(api.issue).toHaveBeenCalledOnce());
    expect(api.issue.mock.calls[0]).toEqual(['departure', { costItemId: cost.id, dueDate: '2027-07-01', requestId: expect.any(String) }]);
    expect(api.issue.mock.calls[0][1]).not.toHaveProperty('amount');
    await waitFor(() => expect(screen.queryByTestId('pay-form')).not.toBeInTheDocument());
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it('shows authoritative partial balance and immutable history', async () => {
    api.get.mockResolvedValue([{ ...payable, paid: 60, remaining: 40, status: 'partial', entries: [{ id: 'payment', amount: 60, kind: 'payment', paymentDate: '2026-10-15' }] }]); show();
    expect(await screen.findByText(en.supplierPayables.status.partial)).toBeInTheDocument();
    expect(screen.getByText('40.00 BAM')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Payment history/)); expect(screen.getByRole('button', { name: en.supplierPayables.reverse })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.supplierPayables.cancel })).not.toBeInTheDocument();
  });
  it('keeps one request/payload across a network failure and component reload', async () => {
    api.get.mockResolvedValue([payable]); api.record.mockRejectedValueOnce(new Error('network'));
    const first = show(); await screen.findByText(en.supplierPayables.status.unpaid);
    fireEvent.click(screen.getByRole('button', { name: en.supplierPayables.record }));
    fireEvent.change(screen.getByLabelText(en.supplierPayables.amount), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText(en.supplierPayables.paymentDate), { target: { value: '2026-10-15' } });
    fireEvent.submit(screen.getByTestId('pay-form').querySelector('form')!);
    await waitFor(() => expect(api.record).toHaveBeenCalledOnce());
    await waitFor(() => expect(within(screen.getByTestId('pay-form')).getByRole('button', { name: en.supplierPayables.retryPending })).toBeEnabled());
    const original = api.record.mock.calls[0][1]; expect(JSON.parse(sessionStorage.getItem(key)!).body).toEqual(original);
    expect(screen.getByLabelText(en.supplierPayables.amount)).toBeDisabled();
    first.unmount(); show();
    const retry = await screen.findByRole('button', { name: en.supplierPayables.retryPending }); fireEvent.click(retry);
    await waitFor(() => expect(api.record).toHaveBeenCalledTimes(2)); expect(api.record.mock.calls[1][1]).toEqual(original);
    await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull());
  });
  it('reconciles a committed-but-lost response from history without a second payment', async () => {
    api.get.mockResolvedValue([payable]);
    api.record.mockImplementationOnce(async (_id, body) => { api.get.mockResolvedValue([{ ...payable, paid: 60, remaining: 40, status: 'partial', entries: [{ id: 'saved', requestId: body.requestId, kind: 'payment', amount: 60, paymentDate: body.paymentDate }] }]); throw new Error('response lost'); });
    show(); await screen.findByText(en.supplierPayables.status.unpaid); fireEvent.click(screen.getByRole('button', { name: en.supplierPayables.record }));
    fireEvent.change(screen.getByLabelText(en.supplierPayables.amount), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText(en.supplierPayables.paymentDate), { target: { value: '2026-10-15' } });
    fireEvent.submit(screen.getByTestId('pay-form').querySelector('form')!);
    expect(await screen.findByText(en.supplierPayables.status.partial)).toBeInTheDocument();
    expect(api.record).toHaveBeenCalledOnce(); expect(sessionStorage.getItem(key)).toBeNull();
  });
  it('does not offer obligations for unlinked or zero costs', async () => {
    show([{ ...cost, supplierId: null }, { ...cost, id: 'zero', totalCost: 0 }]); await screen.findByText(en.supplierPayables.empty);
    expect(screen.getByRole('button', { name: en.supplierPayables.issue })).toBeDisabled();
  });
  it('blocks writes while the authoritative ledger cannot be loaded', async () => {
    api.get.mockRejectedValue(new Error('database')); show(); expect(await screen.findByRole('alert')).toHaveTextContent(en.supplierPayables.loadError);
    expect(screen.getByRole('button', { name: en.supplierPayables.issue })).toBeDisabled();
  });
  it('unlocks a definitively rejected request and refreshes the remaining balance', async () => {
    api.get.mockResolvedValue([payable]);
    api.record.mockImplementationOnce(async () => { api.get.mockResolvedValue([{ ...payable, paid: 70, remaining: 30, status: 'partial' }]); throw { status: 409, code: 'PAYABLE_BALANCE_CONFLICT' }; });
    show(); await screen.findByText(en.supplierPayables.status.unpaid); fireEvent.click(screen.getByRole('button', { name: en.supplierPayables.record }));
    fireEvent.change(screen.getByLabelText(en.supplierPayables.amount), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText(en.supplierPayables.paymentDate), { target: { value: '2026-10-15' } });
    fireEvent.submit(screen.getByTestId('pay-form').querySelector('form')!);
    await waitFor(() => expect(screen.getByLabelText(en.supplierPayables.amount)).toBeEnabled());
    await waitFor(() => expect(screen.getByLabelText(en.supplierPayables.amount)).toHaveAttribute('max', '30'));
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(within(screen.getByTestId('pay-form')).getByRole('alert')).toHaveTextContent(en.supplierPayables.balanceConflict);
  });
  it('ignores malformed persisted state without crashing', async () => {
    sessionStorage.setItem(key, JSON.stringify({ action: 'entry' })); show(); await screen.findByText(en.supplierPayables.empty);
    expect(screen.queryByText(en.supplierPayables.pending)).not.toBeInTheDocument();
  });
  it('does not generate two financial requests from same-tick submits', async () => {
    api.get.mockResolvedValue([payable]); let resolve!: () => void;
    api.record.mockImplementation(() => new Promise<void>(r => { resolve=r; }));
    show(); await screen.findByText(en.supplierPayables.status.unpaid);
    fireEvent.click(screen.getByRole('button', { name: en.supplierPayables.record }));
    fireEvent.change(screen.getByLabelText(en.supplierPayables.amount), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(en.supplierPayables.paymentDate), { target: { value: '2026-10-19' } });
    const form=screen.getByTestId('pay-form').querySelector('form')!;
    act(() => { form.dispatchEvent(new Event('submit', { bubbles:true,cancelable:true })); form.dispatchEvent(new Event('submit', { bubbles:true,cancelable:true })); });
    expect(api.record).toHaveBeenCalledTimes(1); resolve();
    await waitFor(() => expect(screen.queryByTestId('pay-form')).not.toBeInTheDocument());
  });

});
