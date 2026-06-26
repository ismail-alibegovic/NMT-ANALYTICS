import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(val => parseInt(val)).default(1),
  pageSize: z.string().regex(/^\d+$/).transform(val => parseInt(val)).default(20),
  orderBy: z.string().default('created_at'),
  orderDir: z.enum(['asc', 'desc']).default('desc'),
});

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * Calculate pagination metadata
 */
export function createPaginationMeta(
  page: number,
  pageSize: number,
  total: number
): PaginationMeta {
  const totalPages = Math.ceil(total / pageSize);

  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Apply pagination to a Supabase query
 */
export function applyPagination(query: any, page: number, pageSize: number, orderBy: string, orderDir: 'asc' | 'desc') {
  const offset = (page - 1) * pageSize;

  return query
    .order(orderBy, { ascending: orderDir === 'asc' })
    .range(offset, offset + pageSize - 1);
}
