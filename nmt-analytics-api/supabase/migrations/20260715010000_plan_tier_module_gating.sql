-- =====================================================================
-- Migration 20260715010000 — Phase 2: Plan/Tier + module gating
-- =====================================================================
-- Adds: organizations.plan (default 'trial')
--       plan_module_map (per-plan default module grants)
--
-- This is the "Plan / tier on organization" deliverable from
-- docs/TRAVLINE_IMPROVEMENT_PLAN.md §7, Faza 2 (Multi-tenant self-serve
-- onboarding). It establishes the foundation for `requireModule()`
-- gating on the backend.
--
-- Backward compatible:
--   * All existing orgs default to 'trial'.
--   * 'trial' plan grants every module that earlier orgs were seeded with,
--     so no live tenant is downgraded.
--
-- Source of truth for module keys is derived from DEFAULT_MODULES in
-- the signup trigger (20260711010000):
--     travel_core, analytics, documents, integrations
-- plus the older seeded keys still seen in production org_modules rows:
--     dashboard, customers, packages, reservations, departures, payments,
--     reports, settings, transactions
-- All of those are considered "core" (always-on) and are granted to every
-- plan. Later "premium" modules (waivers, sub_agents, hotels, excursions,
-- proposals) are gated by plan once those features get re-extracted from
-- the broken WIP stash.
-- =====================================================================

-- 1. organizations.plan column -------------------------------------
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'trial'
    CHECK (plan IN ('trial','core','pro','full'));

-- 2. plan_module_map -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_module_map (
    plan        text NOT NULL,
    module_key  text NOT NULL,
    enabled     boolean NOT NULL DEFAULT true,
    PRIMARY KEY (plan, module_key),
    CHECK (plan IN ('trial','core','pro','full'))
);

COMMENT ON TABLE public.plan_module_map IS
    'Default module grants per subscription plan; an org may further restrict a module via org_modules.enabled=false (overrides downward only).';

-- 3. Seed the plan → module defaults -------------------------------
-- "core" group: every module that existed before plan-tier gating.
-- Granted to ALL plans so no existing tenant regresses.
INSERT INTO public.plan_module_map (plan, module_key, enabled) VALUES
    -- trial
    ('trial','travel_core',true),('trial','analytics',true),
    ('trial','documents',true),('trial','integrations',true),
    ('trial','dashboard',true),('trial','customers',true),
    ('trial','packages',true),('trial','reservations',true),
    ('trial','departures',true),('trial','payments',true),
    ('trial','reports',true),('trial','settings',true),
    ('trial','transactions',true),
    -- core (= trial + premium modules that always came with it)
    ('core','travel_core',true),('core','analytics',true),
    ('core','documents',true),('core','integrations',true),
    ('core','dashboard',true),('core','customers',true),
    ('core','packages',true),('core','reservations',true),
    ('core','departures',true),('core','payments',true),
    ('core','reports',true),('core','settings',true),
    ('core','transactions',true),
    -- pro (= core + future premium: sub_agents, hotels, excursions, waivers)
    ('pro','travel_core',true),('pro','analytics',true),
    ('pro','documents',true),('pro','integrations',true),
    ('pro','dashboard',true),('pro','customers',true),
    ('pro','packages',true),('pro','reservations',true),
    ('pro','departures',true),('pro','payments',true),
    ('pro','reports',true),('pro','settings',true),
    ('pro','transactions',true),
    ('pro','sub_agents',true),('pro','hotels',true),
    ('pro','excursions',true),('pro','waivers',true),
    -- full (everything; placeholder for future modules)
    ('full','travel_core',true),('full','analytics',true),
    ('full','documents',true),('full','integrations',true),
    ('full','dashboard',true),('full','customers',true),
    ('full','packages',true),('full','reservations',true),
    ('full','departures',true),('full','payments',true),
    ('full','reports',true),('full','settings',true),
    ('full','transactions',true),
    ('full','sub_agents',true),('full','hotels',true),
    ('full','excursions',true),('full','waivers',true),
    ('full','proposals',true)
ON CONFLICT (plan, module_key) DO NOTHING;

-- 4. RLS so tenant users can READ the map (it's public-ish metadata)
ALTER TABLE public.plan_module_map ENABLE ROW LEVEL SECURITY;
-- reads from any authenticated session; this table is reference data only
CREATE POLICY plan_module_map_read_all ON public.plan_module_map
    FOR SELECT USING (true);
-- writes only via service_role (no INSERT/UPDATE/DELETE policy for clients)

-- 5. Index for the gating lookup path (PG already has PK on (plan,module_key)
--    but be explicit so requirePlan.ts queries stay O(1)).

-- 6. Backfill org_modules for any existing-but-unseeded module key in the
--    org's current plan, so access is consistent with plan defaults.
--    (org_modules is the org-local override layer; absence = falls back to
--     the plan default which we treat as "enabled" — but we'll seed the row
--     explicitly to keep the cache invalidation logic simple.)
INSERT INTO public.org_modules (org_id, module_key, enabled)
SELECT o.id, m.module_key, m.enabled
FROM   public.organizations o
JOIN   public.plan_module_map m ON m.plan = o.plan
WHERE  NOT EXISTS (
    SELECT 1 FROM public.org_modules om
    WHERE  om.org_id = o.id AND om.module_key = m.module_key
)
ON CONFLICT (org_id, module_key) DO NOTHING;
