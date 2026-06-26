import { get } from './client';

export interface AuditLog {
    id: string;
    org_id: string;
    user_id: string;
    action: string;
    entity: string;
    entity_id: string;
    details: {
        oldValues?: any;
        newValues?: any;
        metadata?: any;
    };
    created_at: string;
    profiles?: {
        full_name: string;
        email: string;
    };
}

export interface AuditLogResponse {
    data: AuditLog[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

/**
 * Fetch paginated audit logs for the current organization
 */
export async function getAuditLogs(params: {
    page?: number;
    limit?: number;
    entity?: string;
    action?: string;
    from?: string;
    to?: string;
    orderBy?: string;
    orderDir?: 'asc' | 'desc';
}) {
    const { data } = await get<AuditLogResponse>('/admin/audit-logs', { params });
    return data;
}

export interface SystemHealth {
    status: string;
    uptime: number;
    timestamp: string;
    services: {
        database: string;
        cache: string;
    };
}

/**
 * Fetch system health status
 */
export async function getSystemHealth() {
    const { data } = await get<SystemHealth>('/health');
    return data;
}
