export enum MetricName {
    REVENUE_TOTAL = 'revenue_total',
    BOOKINGS_TOTAL = 'bookings_total',
    CUSTOMERS_TOTAL = 'customers_total',
    REVENUE_SERIES = 'revenue_series',
    BOOKINGS_SERIES = 'bookings_series'
}

export interface MetricDefinition {
    name: MetricName;
    description: string;
}

export const METRICS: Record<MetricName, MetricDefinition> = {
    [MetricName.REVENUE_TOTAL]: {
        name: MetricName.REVENUE_TOTAL,
        description: 'Sum of all payments (transactions with type="payment")'
    },
    [MetricName.BOOKINGS_TOTAL]: {
        name: MetricName.BOOKINGS_TOTAL,
        description: 'Total count of reservations (all statuses)'
    },
    [MetricName.CUSTOMERS_TOTAL]: {
        name: MetricName.CUSTOMERS_TOTAL,
        description: 'Total count of unique customers'
    },
    [MetricName.REVENUE_SERIES]: {
        name: MetricName.REVENUE_SERIES,
        description: 'Time series of revenue grouped by granularity'
    },
    [MetricName.BOOKINGS_SERIES]: {
        name: MetricName.BOOKINGS_SERIES,
        description: 'Time series of bookings grouped by granularity'
    },
};
