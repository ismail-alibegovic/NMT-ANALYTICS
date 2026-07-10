-- Migration: HR fiscalization config + fiscal_submissions table
-- Part of the abstract fiscal compliance layer (see AGENTS.md)

-- Add market configuration to org_settings
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS fiscal_market text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hr_fiscal_endpoint text DEFAULT '',
  ADD COLUMN IF NOT EXISTS hr_fiscal_cert text DEFAULT '';

-- Create unified fiscal_submissions table (replaces single-purpose eturista_submissions)
CREATE TABLE IF NOT EXISTS fiscal_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  market text NOT NULL CHECK (market IN ('RS', 'HR', 'BA_FBIH', 'BA_RS')),
  departure_id uuid REFERENCES departures(id) ON DELETE SET NULL,
  guest_count integer DEFAULT 0,
  payload jsonb DEFAULT '{}',
  response_status text NOT NULL,
  response_body jsonb DEFAULT '{}',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for org-scoped lookups
CREATE INDEX IF NOT EXISTS idx_fiscal_submissions_org_market
  ON fiscal_submissions(org_id, market);

-- RLS: org-scoped access
ALTER TABLE fiscal_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY fiscal_submissions_org_isolation ON fiscal_submissions
  USING (org_id = (SELECT (auth.jwt() ->> 'org_id')::uuid));

-- Service role bypasses RLS, so add a fallback: the policy alone is enough
-- for trusted backend access.

-- Also update existing eturista_submissions to reference fiscal_submissions
-- by creating a view for backward compat
CREATE OR REPLACE VIEW eturista_submissions_view AS
SELECT
  id,
  org_id,
  departure_id,
  guest_count,
  payload,
  response_status,
  response_body,
  submitted_at,
  created_at
FROM fiscal_submissions
WHERE market = 'RS';
