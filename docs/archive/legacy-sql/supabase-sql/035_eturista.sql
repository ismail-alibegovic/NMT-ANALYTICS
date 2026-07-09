-- 035_eturista.sql
-- CIS / eTurista government integration for guest arrival data submission.
-- Travel agencies in Bosnia/Serbia must submit guest data to government systems.
-- Configurable endpoint per org via org_settings.

CREATE TABLE IF NOT EXISTS eturista_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    departure_id UUID REFERENCES departures(id) ON DELETE SET NULL,
    submission_date DATE NOT NULL DEFAULT CURRENT_DATE,
    guest_count INT NOT NULL DEFAULT 0,
    raw_payload JSONB NOT NULL DEFAULT '{}',
    response_status TEXT,
    response_body JSONB DEFAULT '{}',
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eturista_org ON eturista_submissions(org_id, submission_date DESC);
CREATE INDEX IF NOT EXISTS idx_eturista_departure ON eturista_submissions(departure_id);

ALTER TABLE eturista_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant access - eturista submissions" ON eturista_submissions;
CREATE POLICY "Tenant access - eturista submissions" ON eturista_submissions
    FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());

COMMENT ON TABLE eturista_submissions IS 'eTurista/CIS government submission records';
COMMENT ON COLUMN eturista_submissions.raw_payload IS 'JSON payload sent to government endpoint';
COMMENT ON COLUMN eturista_submissions.response_status IS 'HTTP status or error from government endpoint';
