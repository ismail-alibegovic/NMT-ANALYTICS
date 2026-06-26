import { Request } from 'express';

export interface AnalyticsScope {
    role: string;
    orgId?: string;
}

/**
 * extracts role and org_id from the authenticated request.
 * Handles super_admin logic (optional org_id) vs regular user (required org_id).
 */
export function getTenantScope(req: Request): AnalyticsScope {
    // @ts-ignore - req.user and req.orgId are populated by middleware
    const user = req.user;
    // @ts-ignore
    const orgId = req.orgId;

    if (!user) {
        throw new Error('User not authenticated');
    }

    // If super_admin, they CAN have an orgId (if filtering), but it's not strictly required by policy if they want global view.
    // However, most analytics are org-specific.
    // If the user request specifically targeted an org (via header/param), orgId will be set.

    if (user.role === 'super_admin') {
        return {
            role: 'super_admin',
            orgId: orgId || undefined
        };
    }

    // For regular users, org_id is strictly required
    if (!orgId) {
        const error = new Error('Organization context required for non-admin users');
        (error as any).status = 403;
        (error as any).code = 'FORBIDDEN';
        throw error;
    }

    // Ensure role is set (should always be set by authenticateToken middleware)
    if (!user.role) {
        const error = new Error('User role not found');
        (error as any).status = 403;
        (error as any).code = 'FORBIDDEN';
        throw error;
    }

    return { role: user.role, orgId };
}
