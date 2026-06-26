import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { config } from "../config";
import { apiError } from "../lib/errors";

export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // DEV_BYPASS_AUTH: allow testing without a real JWT
  if (config.DEV_BYPASS_AUTH) {
    const bypassId = "00000000-0000-0000-0000-000000000000";
    req.user = { id: bypassId, email: "dev-bypass@nmt-analytics.com", role: "super_admin" };

    // Set orgId from DEV_ORG_ID or fetch first org
    if (config.DEV_ORG_ID) {
      req.orgId = config.DEV_ORG_ID;
      console.log(`[AUTH] DEV_BYPASS: Using DEV_ORG_ID: ${config.DEV_ORG_ID}`);
    } else {
      // Fetch first organization from database
      try {
        const { data: orgs } = await supabaseAdmin
          .from('organizations')
          .select('id')
          .limit(1)
          .single();

        if (orgs) {
          req.orgId = orgs.id;
          console.log(`[AUTH] DEV_BYPASS: Auto-selected first org: ${orgs.id}`);
        } else {
          console.warn(`[AUTH] DEV_BYPASS: No organizations found in database. Create one or set DEV_ORG_ID.`);
        }
      } catch (err) {
        console.error(`[AUTH] DEV_BYPASS: Failed to fetch organization:`, err);
      }
    }

    return next();
  }

  const authHeader = req.headers.authorization;
  const hasAuthHeader = !!authHeader && authHeader.startsWith("Bearer ");

  if (!hasAuthHeader) {
    return apiError(res, 401, "UNAUTHORIZED", "Authentication required");
  }

  const token = authHeader.split(" ")[1];

  try {
    // Validate the token and get user info
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error) {
      console.error(`[AUTH] Request ${req.requestId}: Supabase auth error: ${error.message}`);
      return apiError(res, 401, "UNAUTHORIZED", "Invalid or expired token", error.message);
    }

    if (data && data.user) {
      req.user = { id: data.user.id, email: data.user.email };

      // Fetch user profile to get org_id and role
      try {
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("org_id, role, id")
          .eq("id", data.user.id)
          .single();

        if (profileError || !profile) {
          // DEV_AUTO_BOOTSTRAP: Auto-create org/profile/modules for new users
          if (config.DEV_AUTO_BOOTSTRAP && config.NODE_ENV === 'development') {
            console.log(`[AUTH] DEV_AUTO_BOOTSTRAP: Creating org/profile/modules for user ${data.user.id}`);

            try {
              // 1. Create or get organization
              let orgId: string;
              const { data: existingOrg } = await supabaseAdmin
                .from('organizations')
                .select('id')
                .limit(1)
                .single();

              if (existingOrg) {
                orgId = existingOrg.id;
                console.log(`[AUTH] DEV_AUTO_BOOTSTRAP: Using existing org ${orgId}`);
              } else {
                const { data: newOrg, error: orgError } = await supabaseAdmin
                  .from('organizations')
                  .insert({
                    name: config.DEV_DEFAULT_ORG_NAME,
                    slug: config.DEV_DEFAULT_ORG_NAME.toLowerCase().replace(/\s+/g, '-')
                  })
                  .select('id')
                  .single();

                if (orgError || !newOrg) {
                  throw new Error(`Failed to create organization: ${orgError?.message}`);
                }
                orgId = newOrg.id;
                console.log(`[AUTH] DEV_AUTO_BOOTSTRAP: Created new org ${orgId}`);
              }

              // 2. Create profile
              const { error: profileInsertError } = await supabaseAdmin
                .from('profiles')
                .insert({
                  id: data.user.id,
                  org_id: orgId,
                  role: config.DEV_DEFAULT_ROLE
                });

              if (profileInsertError) {
                throw new Error(`Failed to create profile: ${profileInsertError.message}`);
              }
              console.log(`[AUTH] DEV_AUTO_BOOTSTRAP: Created profile for user ${data.user.id}`);

              // 3. Create org_modules
              const moduleKeys = config.DEV_DEFAULT_MODULES.split(',').map(m => m.trim());
              const moduleInserts = moduleKeys.map(key => ({
                org_id: orgId,
                module_key: key,
                enabled: true
              }));

              const { error: modulesError } = await supabaseAdmin
                .from('org_modules')
                .insert(moduleInserts);

              if (modulesError) {
                console.warn(`[AUTH] DEV_AUTO_BOOTSTRAP: Failed to create modules: ${modulesError.message}`);
              } else {
                console.log(`[AUTH] DEV_AUTO_BOOTSTRAP: Created ${moduleKeys.length} modules`);
              }

              // Set context and continue
              req.orgId = orgId;
              req.user.role = config.DEV_DEFAULT_ROLE;
              console.log(`[AUTH] DEV_AUTO_BOOTSTRAP: Bootstrap complete for user ${data.user.id}`);
              return next();
            } catch (bootstrapErr) {
              console.error(`[AUTH] DEV_AUTO_BOOTSTRAP: Bootstrap failed:`, bootstrapErr);
              return apiError(res, 500, "BOOTSTRAP_ERROR", "Failed to auto-bootstrap user context", bootstrapErr instanceof Error ? bootstrapErr.message : String(bootstrapErr));
            }
          }

          // If not in dev mode or bootstrap disabled, return 403
          if (config.NODE_ENV === 'development') {
            console.warn(`[AUTH] Request ${req.requestId}: Profile not found for user ${data.user.id}`);
          }
          return apiError(res, 403, "ORG_CONTEXT_REQUIRED", "Organization context required");
        }

        // Populate org context
        req.orgId = profile.org_id;
        req.user.role = profile.role;

        if (config.NODE_ENV === 'development' && (!req.orgId || !req.user.role)) {
          console.warn(`[AUTH] Request ${req.requestId}: Missing context - orgId: ${req.orgId}, role: ${req.user.role}`);
        }

        next();
      } catch (profileErr) {
        console.error(`[AUTH] Request ${req.requestId}: Error fetching profile:`, profileErr);
        return apiError(res, 500, "INTERNAL_ERROR", "Internal server error fetching user context", profileErr instanceof Error ? profileErr.message : String(profileErr));
      }
    } else {
      return apiError(res, 401, "UNAUTHORIZED", "User not found in auth");
    }
  } catch (err) {
    console.error(`[AUTH] Request ${req.requestId}: Error authenticating token:`, err);
    return apiError(res, 500, "INTERNAL_ERROR", "Internal server error during auth", err instanceof Error ? err.message : String(err));
  }
}
