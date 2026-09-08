export interface ReservationInstallmentSchedule {
  reservationId: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  paymentStatus?: string | null;
  currency: string;
  installments: {
    id: string;
    installmentNumber: number;
    amount: number;
    currency: string;
    status: string;
    paymentDate?: string | null;
    dueDate?: string | null;
    remainingAfter?: number | null;
    overdue: boolean;
    createdAt?: string;
  }[];
  summary: {
    totalScheduled: number;
    paidScheduled: number;
    outstandingScheduled: number;
    overdueCount: number;
  };
}

export async function createReservationInstallmentSchedule(
  reservationId: string,
  installmentCount: number,
): Promise<ReservationInstallmentSchedule> {
  const { put } = await import('./client');
  const { data } = await put<ReservationInstallmentSchedule>(`/reservations/${reservationId}/installments`, {
    installmentCount,
  });
  return data;
}

export async function getReservationInstallmentSchedule(
  reservationId: string,
): Promise<ReservationInstallmentSchedule> {
  const { get } = await import('./client');
  const { data } = await get<ReservationInstallmentSchedule>(`/reservations/${reservationId}/installments`);
  return data;
}
