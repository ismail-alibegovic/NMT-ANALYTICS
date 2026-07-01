import { get, post, patch } from './client';

// ============================================================================
// TYPES
// ============================================================================

export interface Payment {
    id: string;
    reservationId: string;
    amount: number;
    currency: string;
    status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';
    paymentMethod?: string | null;
    paymentDate: string | null;
    createdAt: string;
    reservation?: {
        id: string;
        customerName: string;
        customerPhone: string;
        totalAmount: number;
        paidAmount: number;
        status: string;
    };
}

export interface PaymentFilters {
    reservationId?: string;
    from?: string; // YYYY-MM-DD
    to?: string;   // YYYY-MM-DD
    page?: number;
    limit?: number;
}

export interface PaymentListResponse {
    data: Payment[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface CreatePaymentInput {
    reservation_id: string;
    amount: number;
    currency?: string;
    status?: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';
    payment_method?: string;
    payment_date?: string; // YYYY-MM-DD
}

// Backward compatibility alias
export type CreatePaymentData = CreatePaymentInput;

export interface CreatePaymentResponse {
    payment: {
        id: string;
        reservationId: string;
        amount: number;
        currency: string;
        status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';
        paymentMethod?: string | null;
        paymentDate: string | null;
        createdAt: string;
    };
    reservation: {
        id: string;
        totalAmount: number;
        paidAmount: number;
        remainingAmount: number;
        status: string;
    } | null;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Get list of payments with optional filtering
 * 
 * @param filters - Optional filters for reservation_id, date range, and pagination
 * @returns Paginated list of payments
 * 
 * @example
 * // Get all payments
 * const payments = await getPayments();
 * 
 * // Get payments for a specific reservation
 * const payments = await getPayments({ reservationId: 'uuid' });
 * 
 * // Get payments within a date range
 * const payments = await getPayments({ from: '2026-01-01', to: '2026-01-31' });
 */
export async function getPayments(filters: PaymentFilters = {}): Promise<PaymentListResponse> {
    const params: Record<string, any> = {};

    if (filters.reservationId) params.reservation_id = filters.reservationId;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.page) params.page = filters.page;
    if (filters.limit) params.limit = filters.limit;

    const { data } = await get<PaymentListResponse>("/payments", { params });
    return data;
}

/**
 * Create a new payment
 * 
 * @param paymentData - Payment data including reservation_id and amount
 * @returns Created payment and updated reservation data
 * 
 * @example
 * // Create payment with defaults (currency=BAM, status=succeeded, payment_date=today)
 * const result = await createPayment({
 *   reservation_id: 'uuid',
 *   amount: 250.00
 * });
 * 
 * // Create payment with all fields
 * const result = await createPayment({
 *   reservation_id: 'uuid',
 *   amount: 500.00,
 *   currency: 'BAM',
 *   status: 'succeeded',
 *   payment_date: '2026-01-14'
 * });
 * 
 * // Access the created payment
 * console.log(result.payment.id);
 * 
 * // Access the updated reservation
 * console.log(result.reservation?.paidAmount);
 */
export async function createPayment(paymentData: CreatePaymentInput): Promise<CreatePaymentResponse> {
    // Ensure amount is a number (parse if string)
    const normalizedData = {
        ...paymentData,
        amount: typeof paymentData.amount === 'string'
            ? parseFloat(paymentData.amount)
            : paymentData.amount
    };

    const { data } = await post<CreatePaymentResponse>('/payments', normalizedData);
    return data;
}

/**
 * Update an existing payment (status or amount)
 */
export async function updatePayment(id: string, updateData: Partial<CreatePaymentInput>): Promise<CreatePaymentResponse> {
    const { data } = await patch<CreatePaymentResponse>(`/payments/${id}`, updateData);
    return data;
}

/**
 * Void/Cancel a payment
 */
export async function voidPayment(id: string): Promise<void> {
    await post(`/payments/${id}/void`, {});
}

/**
 * Refund a succeeded payment
 * @param id Payment ID
 * @param reason Optional reason for the refund
 */
export async function refundPayment(id: string, reason?: string): Promise<CreatePaymentResponse> {
    const { data } = await post<CreatePaymentResponse>(`/payments/${id}/refund`, { reason });
    return data;
}

// ============================================================================
// PAYMENT DASHBOARD TYPES & API
// ============================================================================

export interface PaymentDashboardMetric {
    id: string;
    customerName: string;
    customerPhone: string;
    packageName: string;
    departureDate: string;
    totalAmount: number;
    paidAmount: number;
    balanceDue: number;
    currency: string;
    paymentStatus: string;
    reservationStatus: string;
}

export interface PaymentDashboardPayment {
    id: string;
    reservationId: string;
    customerName: string;
    customerPhone: string;
    amount: number;
    currency: string;
    status: string;
    paymentMethod?: string;
    paymentDate: string;
    createdAt: string;
}

export interface PaymentDashboardResponse {
    metrics: {
        totalPaidToday: number;
        totalPaidThisMonth: number;
        totalPendingAmount: number;
        totalFailedAmount: number;
        overdueAmount: number;
        overdueCount: number;
        pendingCount: number;
    };
    overdueReservations: PaymentDashboardMetric[];
    pendingPayments: PaymentDashboardPayment[];
    recentPayments: PaymentDashboardPayment[];
}

/**
 * Get payment dashboard data
 */
export async function getPaymentDashboard(): Promise<PaymentDashboardResponse> {
    const { data } = await get<PaymentDashboardResponse>('/payments/dashboard');
    return data;
}

