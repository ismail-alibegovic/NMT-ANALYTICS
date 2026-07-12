-- Migration: Digital passenger waivers (excursions)
-- Adds waiver infrastructure: org-level waiver templates + per-passenger waiver state.

-- ── 1. waiver_templates ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.waiver_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Pristanak putnika za ekskurziju',
  body TEXT NOT NULL,
  -- Structured declarations the passenger must confirm (checkbox-style)
  -- Example: [{"id":"health","label":"Potvrđujem da nemam zdravstvenih tegoba koje bi me sprečavale da učestvujem","required":true}, ...]
  declarations JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id)
);

ALTER TABLE public.waiver_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant access - Waiver templates" ON public.waiver_templates;
CREATE POLICY "Tenant access - Waiver templates" ON public.waiver_templates
  FOR ALL USING (org_id = public.get_my_org_id()) WITH CHECK (org_id = public.get_my_org_id());

COMMENT ON TABLE public.waiver_templates IS 'Per-org waiver template with terms body and structured declaration checkboxes.';

-- ── 2. waiver_tokens (per-passenger secure URLs) ─────────────
-- A signed token lets a passenger access their waiver page without auth.
-- Tokens are single-use-friendly (revocable), scoped to a passenger row.
CREATE TABLE IF NOT EXISTS public.waiver_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES public.excursion_passengers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,  -- SHA-256 hash of the token string; the raw token never stored
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  revoked_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,   -- Set when waiver is actually signed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.waiver_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant access - Waiver tokens" ON public.waiver_tokens;
CREATE POLICY "Tenant access - Waiver tokens" ON public.waiver_tokens
  FOR ALL USING (org_id = public.get_my_org_id()) WITH CHECK (org_id = public.get_my_org_id());

CREATE INDEX IF NOT EXISTS idx_waiver_tokens_token_hash ON public.waiver_tokens(token_hash);

COMMENT ON TABLE public.waiver_tokens IS 'Secure per-passenger access tokens for the public waiver signing page.';

-- ── 3. Add waiver columns to excursion_passengers ───────────
ALTER TABLE public.excursion_passengers
  ADD COLUMN IF NOT EXISTS waiver_signed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS waiver_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS waiver_signature TEXT,  -- base64 PNG signature image
  ADD COLUMN IF NOT EXISTS waiver_data JSONB,      -- {template_version, declarations: {health:true,...}, signed_via_mobile: true}
  ADD COLUMN IF NOT EXISTS waiver_ip TEXT;

COMMENT ON COLUMN public.excursion_passengers.waiver_signed IS 'Whether the passenger has digitally signed the waiver.';
COMMENT ON COLUMN public.excursion_passengers.waiver_signature IS 'Base64-encoded PNG of the passenger signature.';
COMMENT ON COLUMN public.excursion_passengers.waiver_data IS 'Captured waiver metadata: template version, declaration answers, signee info.';

-- ── 4. Seed a default template for each existing org ───────
INSERT INTO public.waiver_templates (org_id, title, body, declarations)
SELECT id, 'Pristanak putnika za ekskurziju',
  'Molimo Vas da pažljivo pročitate sljedeći tekst i potvrdite izjave prije potpisivanja.

1. Učestvujem na ekskurziji dobrovoljno i potvrđujem da sam upoznat/a sa programom putovanja.
2. Saglasan/la sam sa opštim uslovima putovanja agencije.
3. Preuzimam odgovornost za vlastitu zdravstvenu sigurnost i lične stvari tokom putovanja.
4. Dozvoljavam fotografisanje/snimanje u svrhu dokumentacije agencije (interni album putovanja), bez komercijalnog korištenja bez moje dodatne saglasnosti.
5. U slučaju vanredne situacije, ovlašćujem vodiča agencije da donese odluke u moje ime radi sigurnosti grupe.',
  '[
    {"id":"health","label":"Potvrđujem da nemam zdravstvenih tegoba koje bi me sprečavale da učestvujem na ekskurziji","required":true},
    {"id":"terms","label":"Pročitao/la sam i prihvatam uslove putovanja","required":true},
    {"id":"media","label":"Dozvoljavam fotografisanje/snimanje u internu dokumentaciju","required":false}
  ]'::jsonb
FROM public.organizations
WHERE NOT EXISTS (
  SELECT 1 FROM public.waiver_templates wt WHERE wt.org_id = organizations.id
);

-- ── 5. RLS for waiver columns on passengers (covered by existing policy) ──
-- excursion_passengers already has "Tenant access - Excursion passengers" policy; new columns inherit it.
