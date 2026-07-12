-- 20260712010000_partner_type_business_rules.sql
-- Feature proposal #4 (improvement plan §5.3, item 4):
-- Automatic markup/commission by partner TYPE (business rules on sub_agents/package_services).
--
-- Adds:
--   1. sub_agents.partner_type  — tier classification (bronze/silver/gold/platinum) default bronze
--   2. sub_agents.markup_pct    — optional extra % markup applied by the organization on top of the
--                                  agent's base price, expressed as a percentage (e.g. 5.00 = +5%)
--   3. commission_rules         — per-org rules keyed by partner_type (+ optional service_type scope)
--                                  that override the sub-agent's default commission_rate when matched
--   4. package_services.markup_pct — per-line-item margin that can be baked into the displayed price
--
-- Resolution order at sale time (see api/src/lib/commissionRules.ts):
--   1. Most specific commission_rule (partner_type + service_type) → wins
--   2. Least specific commission_rule (partner_type only, service_type IS NULL) → fallback
--   3. sub_agents.commission_rate → last resort

-- ── 1. Extend sub_agents ──────────────────────────────────────
ALTER TABLE public.sub_agents
    ADD COLUMN IF NOT EXISTS partner_type TEXT NOT NULL DEFAULT 'bronze'
        CHECK (partner_type IN ('bronze','silver','gold','platinum')),
    ADD COLUMN IF NOT EXISTS markup_pct NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (markup_pct >= 0 AND markup_pct <= 100);

COMMENT ON COLUMN public.sub_agents.partner_type IS 'Tier classification driving commission/markup rules: bronze|silver|gold|platinum.';
COMMENT ON COLUMN public.sub_agents.markup_pct   IS 'Extra % markup organization applies on top of agent base price. 5.00 = +5%.';

-- ── 2. Extend package_services ───────────────────────────────
ALTER TABLE public.package_services
    ADD COLUMN IF NOT EXISTS markup_pct NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (markup_pct >= 0 AND markup_pct <= 100);

COMMENT ON COLUMN public.package_services.markup_pct IS 'Optional margin baked into the displayed line-item price. 0 = no markup.';

-- ── 3. commission_rules ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    partner_type TEXT NOT NULL CHECK (partner_type IN ('bronze','silver','gold','platinum')),
    -- Optional scope: if service_type IS NULL the rule applies to ALL services for that partner_type.
    service_type TEXT CHECK (service_type IS NULL OR service_type IN ('hotel','transport','tour','insurance','extra')),
    commission_pct NUMERIC(5,2) NOT NULL CHECK (commission_pct >= 0 AND commission_pct <= 100),
    markup_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (markup_pct >= 0 AND markup_pct <= 100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    priority INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- A rule MUST target exactly one partner_type. Service_type is the discriminator that makes a rule
    -- more specific. Two active rules with the same (org_id, partner_type, service_type) are forbidden.
    UNIQUE (org_id, partner_type, service_type)
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_org ON public.commission_rules(org_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_rules_org_partner_active
    ON public.commission_rules(org_id, partner_type, service_type)
    WHERE is_active = TRUE;

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant access - Commission rules" ON public.commission_rules;
CREATE POLICY "Tenant access - Commission rules" ON public.commission_rules
    FOR ALL USING (org_id = public.get_my_org_id()) WITH CHECK (org_id = public.get_my_org_id());

COMMENT ON TABLE public.commission_rules IS 'Business rules: effective commission + markup keyed by partner_type and (optional) service_type. Most specific match wins.';
COMMENT ON COLUMN public.commission_rules.service_type  IS 'Service scope; NULL = applies to all service types for this partner_type.';
COMMENT ON COLUMN public.commission_rules.commission_pct IS 'Effective commission percentage when this rule matches. 5.00 = 5%.';
COMMENT ON COLUMN public.commission_rules.markup_pct     IS 'Effective markup percentage on top of base price when this rule matches. 5.00 = +5%.';
COMMENT ON COLUMN public.commission_rules.priority       IS 'Tiebreaker only. Higher = wins when multiple rules have the same specificity. Reserved hook for future overrides.';

-- ── updated_at trigger for commission_rules ──────────────────
CREATE OR REPLACE FUNCTION public.trg_commission_rules_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_commission_rules_touch ON public.commission_rules;
CREATE TRIGGER trg_commission_rules_touch
    BEFORE UPDATE ON public.commission_rules
    FOR EACH ROW EXECUTE FUNCTION public.trg_commission_rules_touch_updated_at();
