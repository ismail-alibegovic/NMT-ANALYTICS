import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { config } from "../config";
import { apiError } from "../lib/errors";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function requireOrgContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    console.log(`[ORG] Request ${req.requestId}: No user in request`);
    return apiError(res, 403, "ORG_CONTEXT_REQUIRED", "Organization context required");
  }

  const userId = req.user.id;

  // Check if we already have orgId from authenticateToken
  if (req.orgId && req.user.role) {
    console.log(`[ORG] Request ${req.requestId}: Already has orgId: ${req.orgId}, role: ${req.user.role}`);
    return next();
  }

  // Fetch profile
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('org_id, role')
    .eq('id', userId)
    .single();

  // If profile exists and has org_id, use it
  if (profile && profile.org_id) {
    req.orgId = profile.org_id;
    req.user.role = profile.role;
    console.log(`[ORG] Request ${req.requestId}: Resolved orgId: ${req.orgId}, role: ${req.user.role}`);
    return next();
  }

  // Profile missing or org_id null - try DEV_AUTO_BOOTSTRAP
  if (config.DEV_AUTO_BOOTSTRAP && config.NODE_ENV === 'development') {
    console.log(`[ORG] Request ${req.requestId}: Profile missing/incomplete, running DEV_AUTO_BOOTSTRAP`);

    try {
      // 1. Create or get organization
      const orgSlug = slugify(config.DEV_DEFAULT_ORG_NAME);
      let org = await supabaseAdmin
        .from('organizations')
        .select('id, name, slug')
        .eq('slug', orgSlug)
        .single();

      if (org.error || !org.data) {
        console.log(`[ORG] Creating organization: ${config.DEV_DEFAULT_ORG_NAME}`);
        const { data: newOrg, error: orgError } = await supabaseAdmin
          .from('organizations')
          .insert({ name: config.DEV_DEFAULT_ORG_NAME, slug: orgSlug })
          .select()
          .single();

        if (orgError || !newOrg) throw orgError || new Error('Failed to create organization');
        org.data = newOrg;
      }

      if (!org.data) {
        throw new Error('Organization data is null');
      }

      const orgId = org.data.id;
      console.log(`[ORG] Using organization: ${org.data.name} (${orgId})`);

      // 2. Upsert profile
      const { error: upsertError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          org_id: orgId,
          role: config.DEV_DEFAULT_ROLE
        }, { onConflict: 'id' });

      if (upsertError) throw upsertError;
      console.log(`[ORG] Upserted profile for user ${userId} with role ${config.DEV_DEFAULT_ROLE}`);

      // 3. Seed org_modules
      const modules = config.DEV_DEFAULT_MODULES.split(',').map(m => m.trim());
      const moduleRows = modules.map(module_key => ({
        org_id: orgId,
        module_key,
        enabled: true
      }));

      const { error: modulesError } = await supabaseAdmin
        .from('org_modules')
        .upsert(moduleRows, { onConflict: 'org_id,module_key' });

      if (modulesError) {
        console.warn(`[ORG] Warning: Could not seed org_modules:`, modulesError.message);
      } else {
        console.log(`[ORG] Seeded ${modules.length} org_modules`);
      }

      // 4. Set context and continue
      req.orgId = orgId;
      req.user.role = config.DEV_DEFAULT_ROLE;
      console.log(`[ORG] ✅ DEV_AUTO_BOOTSTRAP complete. orgId: ${orgId}`);
      return next();

    } catch (err) {
      console.error(`[ORG] DEV_AUTO_BOOTSTRAP failed:`, err);
      return apiError(res, 500, "BOOTSTRAP_FAILED", "Failed to auto-create organization context", err instanceof Error ? err.message : String(err));
    }
  }

  // No profile and not in dev mode - return 403
  console.log(`[ORG] Request ${req.requestId}: No org context and DEV_AUTO_BOOTSTRAP disabled`);
  return apiError(res, 403, "ORG_CONTEXT_REQUIRED", "Organization context required. Profile not found or org_id missing.");
}
