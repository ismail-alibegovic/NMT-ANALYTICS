-- Phase 12 Step 12B — Optional Source FK Semantics Fix
-- Only itineraries.inquiry_id needed fixing; others already SET NULL from prior work.

BEGIN;

ALTER TABLE itineraries
  DROP CONSTRAINT itineraries_inquiry_org_fk,
  ADD CONSTRAINT itineraries_inquiry_org_fk
    FOREIGN KEY (inquiry_id, org_id) REFERENCES inquiries(id, org_id)
    ON DELETE SET NULL;

COMMIT;
