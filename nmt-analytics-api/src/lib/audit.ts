import { Request } from 'express';
import { supabaseAdmin } from './supabase';

export interface AuditLogDetails {
    oldValues?: any;
    newValues?: any;
    metadata?: any;
}

/**
 * Log an action to the audit_logs table
 * Automatically extracts orgId and userId from the request context
 */
export async function logAction(
    req: Request,
    action: string,
    entity: string,
    entityId: string,
    details: AuditLogDetails = {}
) {
    try {
        const orgId = req.orgId;
        const userId = req.user?.id;

        if (!orgId) {
            console.warn(`[AUDIT] Missing orgId for action ${action} on ${entity} ${entityId}`);
            return;
        }

        const { error } = await supabaseAdmin
            .from('audit_logs')
            .insert({
                org_id: orgId,
                user_id: userId,
                action,
                entity,
                entity_id: entityId,
                details
            });

        if (error) {
            console.error('Failed to create audit log:', error);
        }
    } catch (err) {
        console.error('Unexpected error creating audit log:', err);
    }
}
