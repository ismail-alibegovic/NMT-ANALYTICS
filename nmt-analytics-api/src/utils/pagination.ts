import { z } from 'zod';

/**
 * Shared helper to format list responses consistently for Admin frontend.
 * Expected shape: { data, total, page, limit, totalPages }
 */
export function formatListResponse<T>(data: T[], total: number, page: number, limit: number) {
    const safeLimit = limit > 0 ? limit : 10;
    return {
        data,
        total,
        page,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || (data.length > 0 ? 1 : 0)
    };
}

/**
 * Common Zod fragments for pagination that support both 'limit' and 'pageSize'
 */
export const paginationQuerySchema = {
    page: z.string().regex(/^\d+$/).transform(val => parseInt(val)).default(1 as any).catch(1 as any),
    pageSize: z.string().regex(/^\d+$/).transform(val => parseInt(val)).optional(),
    limit: z.string().regex(/^\d+$/).transform(val => parseInt(val)).optional(),
    orderBy: z.string().optional(),
    orderDir: z.enum(['asc', 'desc']).default('desc'),
};

/**
 * Common Zod fragments for date ranges that support both 'from/to' and 'dateFrom/dateTo'
 */
export const dateRangeQuerySchema = {
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
};

/**
 * Helper to extract and normalize pagination params from Zod validated data
 */
export function getPaginationParams(validatedData: any, defaultLimit = 10) {
    const page = validatedData.page || 1;
    const limit = validatedData.limit || validatedData.pageSize || defaultLimit;
    return {
        page,
        limit,
        offset: (page - 1) * limit
    };
}

/**
 * Helper to extract and normalize date range params from Zod validated data
 */
export function getDateRangeParams(validatedData: any) {
    const from = validatedData.from || validatedData.dateFrom;
    const to = validatedData.to || validatedData.dateTo;
    return { from, to };
}
