import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { logAuditEntry } from '../middleware/auditLogger';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';

const router = Router();

router.use(authenticateToken);
router.use(requireOrgContext);
router.use(requireMinimumRole('director'));

export const ASSIGNABLE_STAFF_ROLES = ['director', 'manager', 'agent', 'viewer'] as const;
export type AssignableStaffRole = (typeof ASSIGNABLE_STAFF_ROLES)[number];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createStaffSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  fullName: z.string().trim().min(2).max(100),
  role: z.enum(ASSIGNABLE_STAFF_ROLES),
  password: z.string().min(12).max(128).optional(),
}).strict();

const updateRoleSchema = z.object({
  role: z.enum(ASSIGNABLE_STAFF_ROLES),
}).strict();

interface StaffProfileRow {
  id: string;
  org_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  created_at: string | null;
  revoked_at: string | null;
}

function isMissingColumnError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42703');
}

function formatMember(row: StaffProfileRow) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    createdAt: row.created_at,
    revokedAt: row.revoked_at ?? null,
    status: row.revoked_at ? 'revoked' as const : 'active' as const,
  };
}

function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;
  const pick = (alphabet: string) => alphabet[crypto.randomInt(alphabet.length)];

  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 16) {
    chars.push(pick(all));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}

async function countActiveDirectors(orgId: string): Promise<{ count: number | null; error: unknown }> {
  const query = supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('role', 'director');

  if (typeof (query as any).is === 'function') {
    const res = await (query as any).is('revoked_at', null);
    return { count: res.count ?? 0, error: res.error };
  }
  const res = await query;
  return { count: res.count ?? 0, error: res.error };
}

// GET /settings/team — list organization staff members (active + revoked)
router.get('/', async (req: Request, res: Response) => {
  const orgId = req.orgId!;

  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, org_id, email, full_name, role, created_at, revoked_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true });

    if (isMissingColumnError(error)) {
      return apiError(res, 503, 'MIGRATION_PENDING', 'Staff lifecycle requires database migration 20261124120000.');
    }
    if (error) {
      console.error('[STAFF] List query failed');
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to load team members');
    }

    const members = ((data || []) as StaffProfileRow[]).map(formatMember);
    return res.json({ members, smtpRequired: false });
  } catch {
    console.error('[STAFF] List exception');
    return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// POST /settings/team — provision a new staff member without requiring SMTP
router.post('/', async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const actorId = req.user!.id;

  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid staff account payload', parsed.error.issues);
  }

  const { email, fullName, role } = parsed.data;
  const initialPassword = parsed.data.password || generateTemporaryPassword();

  try {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: {
        travline_staff_org_id: orgId,
        travline_staff_role: role,
      },
    });

    if (createErr) {
      const msg = (createErr.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
        return apiError(res, 409, 'USER_EXISTS', 'An account with this email already exists.');
      }
      if (msg.includes('invalid_staff_role') || msg.includes('staff_org_not_found')) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'Staff provisioning validation failed.');
      }
      console.error('[STAFF] Auth createUser failed');
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to provision staff account');
    }

    const createdUserId = created?.user?.id;
    if (!createdUserId) {
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to provision staff account');
    }

    // Verify trigger placed profile inside caller's org with requested role.
    // GoTrue admin.createUser may insert auth.users before writing app_metadata,
    // in which case we atomically attach the profile via service-only RPC.
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, org_id, email, full_name, role, created_at, revoked_at')
      .eq('id', createdUserId)
      .maybeSingle();

    if (isMissingColumnError(profileErr)) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(createdUserId);
      } catch {
        // Best-effort cleanup of unattached Auth user.
      }
      return apiError(res, 503, 'MIGRATION_PENDING', 'Staff provisioning requires database migration 20261124120000.');
    }

    let row = profile as StaffProfileRow | null;
    if (!row || row.org_id !== orgId || row.role !== role) {
      const orphanOrgId = row && row.org_id !== orgId ? row.org_id : null;
      const { data: attached, error: attachErr } = await supabaseAdmin.rpc('assign_staff_profile_atomic', {
        p_user_id: createdUserId,
        p_org_id: orgId,
        p_role: role,
        p_email: email,
        p_full_name: fullName,
      });

      const attachCode = (attachErr as { code?: string } | null)?.code;
      if (attachErr || !attached) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(createdUserId);
        } catch {
          // Best-effort cleanup of unattached Auth user.
        }
        if (orphanOrgId) {
          try {
            await supabaseAdmin.from('organizations').delete().eq('id', orphanOrgId);
          } catch {
            // Best-effort cleanup of orphan org.
          }
        }
        if (attachCode === 'PGRST202' || attachCode === '42883' || isMissingColumnError(attachErr)) {
          return apiError(res, 503, 'MIGRATION_PENDING', 'Staff provisioning requires database migration 20261124120000.');
        }
        console.error('[STAFF] Staff profile assignment RPC failed');
        return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to assign staff profile');
      }

      row = attached as StaffProfileRow;
    }

    await logAuditEntry({
      org_id: orgId,
      user_id: actorId,
      action: 'CREATE',
      entity: 'staff_member',
      entity_id: createdUserId,
      metadata: {
        role,
        provisioning_mode: 'direct_credentials_no_smtp',
      },
    });

    return res.status(201).json({
      member: formatMember(row),
      initialPassword,
      smtpRequired: false,
    });
  } catch {
    console.error('[STAFF] Provision exception');
    return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// PATCH /settings/team/:memberId/role — change role within own organization
router.patch('/:memberId/role', async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const actorId = req.user!.id;
  const { memberId } = req.params;

  if (!UUID_REGEX.test(memberId)) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid member ID');
  }

  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid role', parsed.error.issues);
  }
  const nextRole = parsed.data.role;

  try {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('profiles')
      .select('id, org_id, email, full_name, role, created_at, revoked_at')
      .eq('id', memberId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (isMissingColumnError(fetchErr)) {
      return apiError(res, 503, 'MIGRATION_PENDING', 'Staff lifecycle requires database migration 20261124120000.');
    }
    if (fetchErr) {
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to load staff member');
    }
    if (!existing) {
      return apiError(res, 404, 'MEMBER_NOT_FOUND', 'Team member not found');
    }

    const target = existing as StaffProfileRow;
    if (target.role === 'super_admin') {
      return apiError(res, 403, 'FORBIDDEN', 'Platform administrators cannot be modified here');
    }
    if (target.revoked_at) {
      return apiError(res, 409, 'MEMBER_REVOKED', 'Reactivate the account before changing its role');
    }

    if (target.role === 'director' && nextRole !== 'director') {
      const { count, error: countErr } = await countActiveDirectors(orgId);
      if (countErr) {
        return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to verify active directors');
      }
      if ((count ?? 0) <= 1) {
        return apiError(res, 409, 'LAST_DIRECTOR_PROTECTED', 'At least one active director must remain in the agency');
      }
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({ role: nextRole })
      .eq('id', memberId)
      .eq('org_id', orgId)
      .select('id, org_id, email, full_name, role, created_at, revoked_at')
      .single();

    if (updateErr || !updated) {
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to update staff role');
    }

    await logAuditEntry({
      org_id: orgId,
      user_id: actorId,
      action: 'UPDATE',
      entity: 'staff_member',
      entity_id: memberId,
      metadata: {
        previous_role: target.role,
        new_role: nextRole,
      },
    });

    return res.json({ member: formatMember(updated as StaffProfileRow) });
  } catch {
    console.error('[STAFF] Role update exception');
    return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// POST /settings/team/:memberId/revoke — immediately revoke API & Auth access
router.post('/:memberId/revoke', async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const actorId = req.user!.id;
  const { memberId } = req.params;

  if (!UUID_REGEX.test(memberId)) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid member ID');
  }
  if (memberId === actorId) {
    return apiError(res, 409, 'CANNOT_REVOKE_SELF', 'You cannot revoke your own active account');
  }

  try {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('profiles')
      .select('id, org_id, email, full_name, role, created_at, revoked_at')
      .eq('id', memberId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (isMissingColumnError(fetchErr)) {
      return apiError(res, 503, 'MIGRATION_PENDING', 'Staff lifecycle requires database migration 20261124120000.');
    }
    if (fetchErr) {
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to load staff member');
    }
    if (!existing) {
      return apiError(res, 404, 'MEMBER_NOT_FOUND', 'Team member not found');
    }

    const target = existing as StaffProfileRow;
    if (target.role === 'super_admin') {
      return apiError(res, 403, 'FORBIDDEN', 'Platform administrators cannot be revoked here');
    }

    if (target.role === 'director' && !target.revoked_at) {
      const { count, error: countErr } = await countActiveDirectors(orgId);
      if (countErr) {
        return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to verify active directors');
      }
      if ((count ?? 0) <= 1) {
        return apiError(res, 409, 'LAST_DIRECTOR_PROTECTED', 'At least one active director must remain in the agency');
      }
    }

    const revokedAt = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({ revoked_at: revokedAt })
      .eq('id', memberId)
      .eq('org_id', orgId)
      .select('id, org_id, email, full_name, role, created_at, revoked_at')
      .single();

    if (isMissingColumnError(updateErr)) {
      return apiError(res, 503, 'MIGRATION_PENDING', 'Staff lifecycle requires database migration 20261124120000.');
    }
    if (updateErr || !updated) {
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to revoke staff member');
    }

    const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(memberId, {
      ban_duration: '876000h',
    });
    if (banErr) {
      console.error('[STAFF] Auth ban failed after profile revocation');
      return apiError(res, 500, 'INTERNAL_ERROR', 'Profile revoked, but session lock could not be finalized');
    }

    await logAuditEntry({
      org_id: orgId,
      user_id: actorId,
      action: 'UPDATE',
      entity: 'staff_member',
      entity_id: memberId,
      metadata: { status: 'revoked' },
    });

    return res.json({ member: formatMember(updated as StaffProfileRow) });
  } catch {
    console.error('[STAFF] Revoke exception');
    return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// POST /settings/team/:memberId/reactivate — restore revoked staff account
router.post('/:memberId/reactivate', async (req: Request, res: Response) => {
  const orgId = req.orgId!;
  const actorId = req.user!.id;
  const { memberId } = req.params;

  if (!UUID_REGEX.test(memberId)) {
    return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid member ID');
  }

  try {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('profiles')
      .select('id, org_id, email, full_name, role, created_at, revoked_at')
      .eq('id', memberId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (isMissingColumnError(fetchErr)) {
      return apiError(res, 503, 'MIGRATION_PENDING', 'Staff lifecycle requires database migration 20261124120000.');
    }
    if (fetchErr) {
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to load staff member');
    }
    if (!existing) {
      return apiError(res, 404, 'MEMBER_NOT_FOUND', 'Team member not found');
    }

    const target = existing as StaffProfileRow;
    if (target.role === 'super_admin') {
      return apiError(res, 403, 'FORBIDDEN', 'Platform administrators cannot be modified here');
    }

    const { error: unbanErr } = await supabaseAdmin.auth.admin.updateUserById(memberId, {
      ban_duration: 'none',
    });
    if (unbanErr) {
      console.error('[STAFF] Auth unban failed');
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to reactivate authentication access');
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({ revoked_at: null })
      .eq('id', memberId)
      .eq('org_id', orgId)
      .select('id, org_id, email, full_name, role, created_at, revoked_at')
      .single();

    if (updateErr || !updated) {
      return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to reactivate staff member');
    }

    await logAuditEntry({
      org_id: orgId,
      user_id: actorId,
      action: 'UPDATE',
      entity: 'staff_member',
      entity_id: memberId,
      metadata: { status: 'active' },
    });

    return res.json({ member: formatMember(updated as StaffProfileRow) });
  } catch {
    console.error('[STAFF] Reactivate exception');
    return apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
