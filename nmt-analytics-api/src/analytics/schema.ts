/**
 * Analytics Schema Mapping
 * 
 * This file defines the mapping between analytic concepts (revenue, bookings, customers)
 * and the actual physical database tables and columns.
 */

export const revenueTable = 'payments';
export const revenueAmountColumn = 'amount';
export const revenueStatusColumn = 'status';
export const revenueCreatedAtColumn = 'payment_date';
export const revenueOrgIdColumn = 'org_id';

export const bookingTable = 'reservations';
export const bookingIdColumn = 'id';
export const bookingStatusColumn = 'status';
export const bookingDateColumn = 'created_at';
export const bookingAmountColumn = 'total_amount';
export const bookingOrgIdColumn = 'org_id';

export const customerTable = 'customers';
export const customerIdColumn = 'id';
export const customerOrgIdColumn = 'org_id';
export const customerCreatedAtColumn = 'created_at';

export const schema = {
    revenue: {
        table: revenueTable,
        amount: revenueAmountColumn,
        status: revenueStatusColumn,
        createdAt: revenueCreatedAtColumn,
        orgId: revenueOrgIdColumn,
        filters: {
            paid: ['succeeded']
        }
    },
    bookings: {
        table: bookingTable,
        id: bookingIdColumn,
        status: bookingStatusColumn,
        date: bookingDateColumn,
        amount: bookingAmountColumn,
        orgId: bookingOrgIdColumn,
        filters: {
            valid: ['confirmed', 'completed', 'pending'], // status != 'cancelled'
            cancelled: ['cancelled']
        }
    },
    customers: {
        table: customerTable,
        id: customerIdColumn,
        orgId: customerOrgIdColumn,
        createdAt: customerCreatedAtColumn
    },
    packages: {
        table: 'packages',
        id: 'id',
        orgId: 'org_id'
    }
};
