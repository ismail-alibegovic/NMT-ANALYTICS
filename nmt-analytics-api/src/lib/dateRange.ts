import { z } from 'zod';

export const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
});

export interface DateRange {
  from: string;
  to: string;
}

/**
 * Get default date range (last 30 days) if not provided
 */
export function getDefaultDateRange(): DateRange {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  return {
    from: startDate.toISOString().split('T')[0] + 'T00:00:00Z',
    to: endDate.toISOString().split('T')[0] + 'T23:59:59Z',
  };
}

/**
 * Parse and validate date range from query params
 * Returns default range if not provided
 */
export function parseDateRange(from?: string, to?: string): DateRange {
  if (from && to) {
    return {
      from: `${from}T00:00:00Z`,
      to: `${to}T23:59:59Z`,
    };
  }

  return getDefaultDateRange();
}

/**
 * Apply date range filter to Supabase query
 */
export function applyDateRange(query: any, dateRange: DateRange, dateField: string = 'created_at') {
  return query
    .gte(dateField, dateRange.from)
    .lte(dateField, dateRange.to);
}
