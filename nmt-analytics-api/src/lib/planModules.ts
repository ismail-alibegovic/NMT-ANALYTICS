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

// Canonical core V1 module keys (aligned with SQL plan_module_map).
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
export type EntitledModuleKey =
  | ModuleKey
  | "sub_agents"
  | "hotels"
  | "excursions"
  | "waivers"
  | "proposals"
  | "ai_assistant";

const CORE_V1_MODULES: EntitledModuleKey[] = [...MODULE_KEYS];
const PRO_EXTRA_MODULES: EntitledModuleKey[] = [
  "sub_agents",
  "hotels",
  "excursions",
  "waivers",
];

// Plan → granted modules. Lower tiers are strict subsets of higher tiers.
// DB plan_module_map grants all 13 core V1 modules to 'trial' and 'core' ('starter')
// so newly registered and staging/trial agencies can operate every V1 screen cleanly.
export const PLAN_MODULE_MAP: Record<PlanTier, ReadonlySet<EntitledModuleKey>> = {
  trial: new Set<EntitledModuleKey>([...CORE_V1_MODULES, "ai_assistant"]),
  starter: new Set<EntitledModuleKey>(CORE_V1_MODULES),
  pro: new Set<EntitledModuleKey>([...CORE_V1_MODULES, ...PRO_EXTRA_MODULES, "ai_assistant"]),
  enterprise: new Set<EntitledModuleKey>([
    ...CORE_V1_MODULES,
    ...PRO_EXTRA_MODULES,
    "proposals",
    "ai_assistant",
  ]),
};

export function isPlanTier(v: unknown): v is PlanTier {
  return typeof v === "string" && (PLAN_TIERS as string[]).includes(v);
}

/**
 * Normalize database/legacy plan names ('core' → 'starter', 'full' → 'enterprise')
 * onto canonical API PlanTier values, defaulting safely to 'trial'.
 */
export function normalizePlanTier(v: unknown): PlanTier {
  if (typeof v !== "string") return "trial";
  const normalized = v.trim().toLowerCase();
  if (normalized === "core") return "starter";
  if (normalized === "full") return "enterprise";
  return isPlanTier(normalized) ? normalized : "trial";
}

// Effective granted flag for a single (plan, moduleKey) pair.
// `false` here means "not entitled by plan tier" — the org-local override
// cannot flip that back on.
export function planGrants(
  plan: PlanTier,
  moduleKey: string
): boolean {
  return PLAN_MODULE_MAP[plan]?.has(moduleKey as EntitledModuleKey) ?? false;
}

/**
 * Compute effective enabled modules for `/me/context`:
 *   effective = PLAN_MODULE_MAP[plan] minus org_modules rows where enabled === false.
 * Local `enabled = true` cannot grant a module outside the plan ceiling.
 */
export function resolveEffectiveModules(
  plan: PlanTier,
  orgModuleRows: Array<{ module_key: string; enabled?: boolean | null }>
): string[] {
  const disabledLocally = new Set(
    (orgModuleRows || [])
      .filter((row) => row.enabled === false)
      .map((row) => row.module_key)
  );
  return Array.from(PLAN_MODULE_MAP[plan]).filter((moduleKey) => !disabledLocally.has(moduleKey));
}
