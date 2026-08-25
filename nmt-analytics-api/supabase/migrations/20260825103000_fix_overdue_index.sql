-- ============================================================================
-- Fix overdue index: overdue = pending past due_date, NOT succeeded past due_date
-- ============================================================================

-- Drop the incorrectly-scoped index from 030
DROP INDEX IF EXISTS idx_payments_overdue;

-- Recreate: overdue candidates are pending installments past due_date
CREATE INDEX IF NOT EXISTS idx_payments_overdue ON payments(due_date)
  WHERE due_date IS NOT NULL AND status = 'pending';
