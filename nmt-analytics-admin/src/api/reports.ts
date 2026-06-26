import { get } from './client';

export interface ReportSummary {
  totalRevenue: number;
  bookedRevenue: number;
  paidRevenue: number;
  unpaidRevenue: number;
  paidPercent: number;
  totalReservations: number;
  totalCustomers: number;
  totalTransactions: number;
  avgOrderValue: number;
  topDestinations: {
    destination: string;
    revenue: number;
    reservations: number;
  }[];
}

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
}

export async function getReportSummary(filters: ReportFilters = {}): Promise<ReportSummary> {
  const params: Record<string, any> = {};
  if (filters.dateFrom) params.from = filters.dateFrom;
  if (filters.dateTo) params.to = filters.dateTo;

  const { data } = await get<ReportSummary>("/reports/summary", { params });
  return data;
}

export async function downloadTransactionsCsv(filters: ReportFilters = {}): Promise<Blob> {
  const params: Record<string, any> = {};
  if (filters.dateFrom) params.from = filters.dateFrom;
  if (filters.dateTo) params.to = filters.dateTo;

  const { data } = await get("/reports/export/transactions.csv", {
    params,
    responseType: "blob",
  });
  return data;
}

export async function downloadReservationsCsv(filters: ReportFilters = {}): Promise<Blob> {
  const params: Record<string, any> = {};
  if (filters.dateFrom) params.from = filters.dateFrom;
  if (filters.dateTo) params.to = filters.dateTo;

  const { data } = await get("/reports/export/reservations.csv", {
    params,
    responseType: "blob",
  });
  return data;
}
