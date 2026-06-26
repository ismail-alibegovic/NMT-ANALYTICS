import { z } from 'zod';
import { Response } from 'express';

export const AnalyticsQuerySchema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
    granularity: z.preprocess((val) => {
        if (typeof val !== 'string') return 'day';
        const normalized = val.toLowerCase();
        if (normalized === 'daily' || normalized === 'day') return 'day';
        if (normalized === 'weekly' || normalized === 'week') return 'week';
        if (normalized === 'monthly' || normalized === 'month') return 'month';
        return 'day';
    }, z.enum(['day', 'week', 'month'])).default('day'),
})
    .refine(data => {
        if (data.from && data.to) {
            return new Date(data.from) <= new Date(data.to);
        }
        return true;
    }, {
        message: "'from' date must be before or equal to 'to' date",
        path: ["from"]
    });

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

export interface AnalyticsResponse<T> {
    meta: {
        range: {
            from: string | null;
            to: string | null;
            granularity: string;
        };
        scope: {
            role: string;
            org_id?: string;
        };
    };
    data: T;
}

/**
 * Standard utility to send analytics response
 */
export function sendAnalyticsResponse<T>(
    res: Response,
    data: T,
    query: AnalyticsQuery,
    scope: { role: string; orgId?: string }
) {
    const response: AnalyticsResponse<T> = {
        meta: {
            range: {
                from: query.from || null,
                to: query.to || null,
                granularity: query.granularity
            },
            scope: {
                role: scope.role,
                org_id: scope.orgId
            }
        },
        data
    };
    res.json(response);
}
