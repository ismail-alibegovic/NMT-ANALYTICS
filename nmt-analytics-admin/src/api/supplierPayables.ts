import { get, post } from './client';

export interface SupplierPayableEntry {
  id: string; requestId: string; kind: 'payment' | 'reversal'; amount: number;
  paymentDate: string; reference: string | null; note: string | null; reversesId: string | null; createdAt: string;
}
export interface SupplierPayable {
  id: string; requestId: string; departureId: string; costItemId: string; supplierId: string; supplierName: string;
  label: string; amount: number; currency: string; dueDate: string; createdAt: string; cancelledAt: string | null;
  paid: number; remaining: number; status: 'unpaid' | 'partial' | 'paid' | 'cancelled'; entries: SupplierPayableEntry[];
}
export type IssuePayable = { requestId: string; costItemId: string; dueDate: string };
export type RecordPayableEntry = { requestId: string; currency: string; paymentDate: string; reference: string; note: string } & (
  { kind: 'payment'; amount: number } | { kind: 'reversal'; reversesId: string }
);
export async function getSupplierPayables(departureId: string) {
  return (await get<{ payables: SupplierPayable[] }>(`/departures/${departureId}/supplier-payables`)).data.payables;
}
export async function issueSupplierPayable(departureId: string, body: IssuePayable) {
  return (await post(`/departures/${departureId}/supplier-payables`, body)).data;
}
export async function recordSupplierPayableEntry(payableId: string, body: RecordPayableEntry) {
  return (await post(`/supplier-payables/${payableId}/entries`, body)).data;
}
export async function cancelSupplierPayable(payableId: string) {
  return (await post(`/supplier-payables/${payableId}/cancel`, {})).data;
}

export type PayableOverviewStatus = 'all' | 'open' | 'overdue' | 'paid' | 'cancelled';
export interface SupplierPayablesOverview {
  asOfDate: string; timezone: string; totalCount: number; page: number; pageSize: number;
  suppliers: { id: string; name: string }[];
  currencies: { currency: string; count: number; outstanding: number; overdue: number; dueToday: number }[];
  payables: (Pick<SupplierPayable, 'id'|'departureId'|'supplierId'|'supplierName'|'label'|'amount'|'currency'|'dueDate'|'paid'|'remaining'|'status'> & { overdue: boolean })[];
}
export async function getSupplierPayablesOverview(filters: { supplierId?: string; status: PayableOverviewStatus; page: number }) {
  const query = new URLSearchParams({ status: filters.status, page: String(filters.page), pageSize: '25' });
  if (filters.supplierId) query.set('supplierId', filters.supplierId);
  return (await get<SupplierPayablesOverview>(`/supplier-payables?${query}`)).data;
}
