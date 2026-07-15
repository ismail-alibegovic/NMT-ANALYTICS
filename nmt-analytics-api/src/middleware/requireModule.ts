// requireModule — express middleware factory
// ---------------------------------------------------------------------------
// Phase 2 deliverable #3 — Plan / Tier module gating.
//
// Gates a route on two layers, in order:
//   1. Plan-tier entitlement   (PLAN_MODULE_MAP via lib/planModules.ts)
//      — the org's subscription plan must grant the module.
//   2. Org-local override       (org_modules.enabled)
//      — even if the plan grants it, the org may have it disabled locally.
//        Local OFF overrides plan ON. Local ON cannot override plan OFF.
//
// Reads plan from the organization row. Until `organizations.plan` column
// exists (pending migration 20260715010000), it defaults to 'trial' for
// every org, which is the existing dev tenant's effective plan.

import { Request, Response, NextFunction, RequestHandler } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { apiError } from "../lib/errors";
import { planGrants, isPlanTier, PLAN_LABELS, type PlanTier } from "../lib/planModules";

export function requireModule(moduleKey: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const orgId = req.orgId;
    if (!orgId) {
      return apiError(
        res,
        403,
        "ORG_CONTEXT_REQUIRED",
        "Organization context required before module check"
      );
    }

    try {
      // 1. Read the org's plan tier.
      const { data: org, error: orgErr } = await supabaseAdmin
        .from("organizations")
        .select("plan")
        .eq("id", orgId)
        .maybeSingle();

      // Defensive: column may be absent until the migration is applied.
      // In that case, treat the org as 'trial'.
      let plan: PlanTier = "trial";
      if (!orgErr && org) {
        const raw = (org as Record<string, unknown>).plan;
        if (typeof raw === "string" && isPlanTier(raw)) plan = raw;
      }

      // 2. Plan-tier entitlement check.
      if (!planGrants(plan, moduleKey)) {
        return apiError(
          res,
          402, // Payment Required
          "MODULE_NOT_ENTITLED",
          `The "${PLAN_LABELS[plan]}" plan does not include the "${moduleKey}" module. Upgrade to access it.`,
          { plan, module: moduleKey }
        );
      }

      // 3. Org-local override check: org_modules.enabled = false disables it.
      const { data: mod, error: modErr } = await supabaseAdmin
        .from("org_modules")
        .select("enabled")
        .eq("org_id", orgId)
        .eq("module_key", moduleKey)
        .maybeSingle();

      // No local row = module defaults to granted (since plan already granted it).
      if (!modErr && mod && mod.enabled === false) {
        return apiError(
          res,
          403,
          "MODULE_DISABLED",
          `Module "${moduleKey}" is disabled for this organization.`,
          { plan, module: moduleKey }
        );
      }

      return next();
    } catch (err) {
      console.error(`[REQUIRE_MODULE] Unexpected error checking module "${moduleKey}":`, err);
      // Fail-open on unexpected errors so a transient DB blip doesn't lock
      // the whole app. Plan gating is a UX entitlements layer, not a
      // security boundary.
      return next();
    }
  };
}
