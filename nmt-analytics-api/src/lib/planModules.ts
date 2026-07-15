// Plan-tier module entitlement map
// ---------------------------------------------------------------------------
// Phase 2 deliverable #3 — Plan / Tier module gating.
//
// Defines which modules each subscription plan tier is *entitled* to. The
// org-local `org_modules` table remains the override layer: an org may
// further *disable* an entitled module (local off wins), but cannot *enable*
// a module its plan does not grant.
//
// Until migration `20260715010000_plan_tier_module_gating.sql` is applied to
// the live DB (adding the `organizations.plan` column), the API hardcodes
// `plan = 'trial'` for every org via settings.ts. After the column lands,
// the value is read from the row directly and PATCH persists it.

export type PlanTier = "trial" | "starter" | "pro" | "enterprise";

export const PLAN_TIERS: PlanTier[] = ["trial", "starter", "pro", "enterprise"];

export const PLAN_LABELS: Record<PlanTier, string> = {
  trial: "Trial",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

// Canonical module keys (must match the values seeded into org_modules by
// migration 20260711010000_self_service_signup.sql).
export const MODULE_KEYS = [
  "dashboard",
  "travel_core",
  "analytics",
  "documents",
  "integrations",
  "customers",
  "packages",
  "departures",
  "reservations",
  "payments",
  "transactions",
  "reports",
  "settings",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

// Plan → granted modules. Lower tiers are strict subsets of higher tiers.
export const PLAN_MODULE_MAP: Record<PlanTier, ReadonlySet<ModuleKey>> = {
  trial: new Set<ModuleKey>([
    "dashboard",
    "travel_core",
    "customers",
    "packages",
    "departures",
    "reservations",
    "settings",
  ]),
  starter: new Set<ModuleKey>([
    "dashboard",
    "travel_core",
    "analytics",
    "customers",
    "packages",
    "departures",
    "reservations",
    "payments",
    "transactions",
    "settings",
  ]),
  pro: new Set<ModuleKey>([
    "dashboard",
    "travel_core",
    "analytics",
    "documents",
    "integrations",
    "customers",
    "packages",
    "departures",
    "reservations",
    "payments",
    "transactions",
    "reports",
    "settings",
  ]),
  enterprise: new Set<ModuleKey>([
    "dashboard",
    "travel_core",
    "analytics",
    "documents",
    "integrations",
    "customers",
    "packages",
    "departures",
    "reservations",
    "payments",
    "transactions",
    "reports",
    "settings",
  ]),
};

export function isPlanTier(v: unknown): v is PlanTier {
  return typeof v === "string" && (PLAN_TIERS as string[]).includes(v);
}

// Effective granted flag for a single (plan, moduleKey) pair.
// `false` here means "not entitled by plan tier" — the org-local override
// cannot flip that back on.
export function planGrants(
  plan: PlanTier,
  moduleKey: string
): boolean {
  return PLAN_MODULE_MAP[plan]?.has(moduleKey as ModuleKey) ?? false;
}
