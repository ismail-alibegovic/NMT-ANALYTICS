import { get, post, patch, del } from './client';

export interface Transaction {
  id: string;
  reservation_id?: string;
  type: string;
  amount: number;
  currency: string;
  note?: string;
  occurred_at: string;
  created_at: string;
}

export interface CreateTransactionData {
  reservation_id?: string;
  type: string;
  amount: number;
  currency: string;
  note?: string;
  occurred_at: string;
}

export interface UpdateTransactionData extends Partial<CreateTransactionData> { }

export interface TransactionFilters {
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  reservationId?: string;
  page?: number;
  limit?: number;
}

export interface TransactionListResponse {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getTransactions(filters: TransactionFilters = {}): Promise<TransactionListResponse> {
  const params: Record<string, any> = {};
  if (filters.type) params.type = filters.type;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  if (filters.reservationId) params.reservationId = filters.reservationId;
  if (filters.page !== undefined) params.page = filters.page;
  if (filters.limit !== undefined) params.limit = filters.limit;

  const { data } = await get<TransactionListResponse>("/transactions", { params });
  return data;
}

export async function getTransaction(id: string): Promise<Transaction> {
  const { data } = await get<Transaction>(`/transactions/${id}`);
  return data;
}

export async function createTransaction(transactionData: CreateTransactionData): Promise<Transaction> {
  const { data } = await post<Transaction>('/transactions', transactionData);
  return data;
}

export async function updateTransaction(id: string, transactionData: UpdateTransactionData): Promise<Transaction> {
  const { data } = await patch<Transaction>(`/transactions/${id}`, transactionData);
  return data;
}

export async function deleteTransaction(id: string): Promise<void> {
  await del(`/transactions/${id}`);
}
