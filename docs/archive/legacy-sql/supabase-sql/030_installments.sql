-- 030_installments.sql
-- Installment tracking on top of the existing payments table.
-- Each payment can be tagged as one installment of a planned schedule, with
-- its due date and the remaining balance after applying it. Overdue warnings
-- are derived (no DB column needed — the backend computes "overdue" from
-- due_date < CURRENT_DATE AND remaining_after > 0 AND status = 'succeeded').

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS installment_number INT,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS remaining_after NUMERIC(12,2);

COMMENT ON COLUMN payments.installment_number IS 'Sequence number within a multi-installment plan (NULL for single/one-off)';
COMMENT ON COLUMN payments.due_date IS 'Planned due date for this installment (independent of payment_date)';
COMMENT ON COLUMN payments.remaining_after IS 'Remaining reservation balance right after this payment was applied';

-- Speed up overdue scans across all orgs
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date)
  WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_overdue ON payments(due_date, remaining_after)
  WHERE due_date IS NOT NULL AND remaining_after > 0 AND status = 'succeeded';
