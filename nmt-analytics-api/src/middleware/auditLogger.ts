import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';

// Audit action types
export type AuditAction = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'DELETE' 
  | 'LOGIN' 
  | 'LOGOUT' 
  | 'VIEW' 
  | 'EXPORT' 
  | 'IMPORT'
  | 'STATUS_CHANGE';

// Entity types that can be audited
export type AuditEntity = 
  | 'customer'
  | 'package'
  | 'reservation'
  | 'departure'
  | 'payment'
  | 'transaction'
  | 'document'
  | 'user'
  | 'organization'
  | 'integration'
  | 'settings';

// Audit log entry
interface AuditLogEntry {
  org_id: string;
  user_id: string;
  action: AuditAction;
  entity: AuditEntity;
  entity_id?: string;
  entity_name?: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Middleware to automatically log audit events
 * Usage: router.post('/customers', auditLog('CREATE', 'customer'), createCustomer)
 */
export function auditLog(
  action: AuditAction,
  entity: AuditEntity,
  getEntityId?: (req: Request) => string | undefined,
  getEntityName?: (req: Request) => string | undefined,
  getChanges?: (req: Request, res: Response) => Record<string, { old: unknown; new: unknown }> | undefined
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original end function
    const originalEnd = res.end;
    const originalJson = res.json;

    // Override res.json to capture response
    res.json = function(body: unknown): Response {
      // Only log successful operations (2xx status)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entry: AuditLogEntry = {
          org_id: req.orgId!,
          user_id: req.user?.id || 'unknown',
          action,
          entity,
          entity_id: getEntityId?.(req) || (body as Record<string, unknown>)?.id as string,
          entity_name: getEntityName?.(req) || (body as Record<string, unknown>)?.name as string,
          ip_address: req.ip || req.socket.remoteAddress,
          user_agent: req.headers['user-agent'],
        };

        // Log async - don't block response
        logAuditEntry(entry).catch(err => {
          console.error('[AUDIT] Failed to log:', err);
        });
      }

      return originalJson.call(this, body) as Response;
    };

    next();
  };
}

/**
 * Manual audit logging - call from route handlers
 */
export async function logAuditEntry(entry: AuditLogEntry): Promise<void> {
  try {
    // Handle dev bypass user - use null instead of fake UUID
    const userId = entry.user_id === '00000000-0000-0000-0000-000000000000' 
      ? null 
      : entry.user_id;

    const { error } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        org_id: entry.org_id,
        user_id: userId,
        action: entry.action,
        entity: entry.entity,
        entity_id: entry.entity_id,
        // Use details column for additional info
        details: {
          entity_name: entry.entity_name,
          changes: entry.changes,
          metadata: entry.metadata,
          ip_address: entry.ip_address,
          user_agent: entry.user_agent
        }
      });

    if (error) {
      console.error('[AUDIT] Insert error:', error);
    }
  } catch (err) {
    console.error('[AUDIT] Exception:', err);
  }
}

/**
 * Helper to extract ID from params
 */
export const getParamId = (param: string) => (req: Request): string | undefined => 
  req.params[param] || req.body[param];

/**
 * Helper to extract name from body
 */
export const getBodyName = (field: string = 'name') => (req: Request): string | undefined => 
  req.body[field];

/**
 * Pre-configured audit middlewares for common operations
 */
export const auditCustomerCreate = auditLog('CREATE', 'customer', undefined, getBodyName());
export const auditCustomerUpdate = auditLog('UPDATE', 'customer', getParamId('id'), getBodyName());
export const auditCustomerDelete = auditLog('DELETE', 'customer', getParamId('id'));

export const auditPackageCreate = auditLog('CREATE', 'package', undefined, getBodyName());
export const auditPackageUpdate = auditLog('UPDATE', 'package', getParamId('id'), getBodyName());
export const auditPackageDelete = auditLog('DELETE', 'package', getParamId('id'));

export const auditReservationCreate = auditLog('CREATE', 'reservation', undefined, undefined);
export const auditReservationUpdate = auditLog('UPDATE', 'reservation', getParamId('id'));
export const auditReservationDelete = auditLog('DELETE', 'reservation', getParamId('id'));

export const auditPaymentCreate = auditLog('CREATE', 'payment', undefined, undefined);
export const auditPaymentUpdate = auditLog('UPDATE', 'payment', getParamId('id'));
export const auditPaymentDelete = auditLog('DELETE', 'payment', getParamId('id'));

export const auditDepartureCreate = auditLog('CREATE', 'departure', undefined, undefined);
export const auditDepartureUpdate = auditLog('UPDATE', 'departure', getParamId('id'));
export const auditDepartureDelete = auditLog('DELETE', 'departure', getParamId('id'));

export const auditDocumentCreate = auditLog('CREATE', 'document', undefined, getBodyName('title'));
export const auditDocumentDelete = auditLog('DELETE', 'document', getParamId('id'));

export const auditSettingsUpdate = auditLog('UPDATE', 'settings', undefined, undefined);

export const auditUserLogin = auditLog('LOGIN', 'user', undefined, undefined);
export const auditUserLogout = auditLog('LOGOUT', 'user', undefined, undefined);
