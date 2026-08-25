-- ============================================================================
-- FINANCIAL TRUTH RESTORE — Hardened Edition
-- Date: 2026-08-25
-- Purpose: Restore canonical financial truth trigger with edge-case hardening.
--
-- Bug: 025_auto_reservation_status.sql overwrote the trigger and stopped
--      updating balance_due + payment_status.
--
-- Edge cases hardened:
--   1. Payment move between reservations → recalc OLD + NEW
--   2. Reservation total_amount change → recalc that reservation
--   3. Recursion guard on reservation trigger (only fires on total_amount change)
-- ============================================================================

-- ============================================================================
-- 1. CANONICAL HELPER — Single source of truth for all recalculations
-- ============================================================================

CREATE OR REPLACE FUNCTION recalc_reservation_financial_truth(p_reservation_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_amount NUMERIC(12, 2);
    v_paid_amount NUMERIC(12, 2);
    v_balance_due NUMERIC(12, 2);
    v_payment_status TEXT;
    v_current_status TEXT;
BEGIN
    -- Read reservation snapshot
    SELECT total_amount, status INTO v_total_amount, v_current_status
    FROM reservations
    WHERE id = p_reservation_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Canonical: paid_amount = SUM(succeeded payments only)
    SELECT COALESCE(SUM(amount), 0) INTO v_paid_amount
    FROM payments
    WHERE reservation_id = p_reservation_id
      AND status = 'succeeded';

    -- Canonical: balance_due = total_amount - paid_amount (floor at 0)
    v_balance_due := GREATEST(v_total_amount - v_paid_amount, 0);

    -- Canonical: payment_status
    IF v_paid_amount <= 0 THEN
        v_payment_status := 'unpaid';
    ELSIF v_paid_amount < v_total_amount THEN
        v_payment_status := 'partially_paid';
    ELSE
        v_payment_status := 'paid';
    END IF;

    -- Persist financial truth
    UPDATE reservations
    SET
        paid_amount = v_paid_amount,
        balance_due = v_balance_due,
        payment_status = v_payment_status
    WHERE id = p_reservation_id;

    -- Auto-completion: confirmed → completed when fully paid
    IF v_paid_amount >= v_total_amount AND v_current_status = 'confirmed' THEN
        UPDATE reservations
        SET status = 'completed'
        WHERE id = p_reservation_id
          AND status = 'confirmed';
    END IF;

    -- Auto-revert: completed → confirmed when underpaid
    IF v_paid_amount < v_total_amount AND v_current_status = 'completed' THEN
        UPDATE reservations
        SET status = 'confirmed'
        WHERE id = p_reservation_id
          AND status = 'completed';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. PAYMENT TRIGGER — Recalculate on payment INSERT/UPDATE/DELETE
--    Handles payment move: OLD reservation + NEW reservation both recalculated
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_payment_financial_truth()
RETURNS TRIGGER AS $$
DECLARE
    v_old_res UUID;
    v_new_res UUID;
BEGIN
    -- DELETE: TG_OP = 'DELETE', OLD is the deleted row
    -- INSERT: TG_OP = 'INSERT', NEW is the inserted row
    -- UPDATE: both available

    IF TG_OP = 'DELETE' THEN
        PERFORM recalc_reservation_financial_truth(OLD.reservation_id);
    ELSIF TG_OP = 'UPDATE' THEN
        -- Payment moved between reservations: recalc BOTH
        IF OLD.reservation_id IS DISTINCT FROM NEW.reservation_id THEN
            PERFORM recalc_reservation_financial_truth(OLD.reservation_id);
            PERFORM recalc_reservation_financial_truth(NEW.reservation_id);
        ELSE
            -- Same reservation: recalc once
            PERFORM recalc_reservation_financial_truth(NEW.reservation_id);
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        PERFORM recalc_reservation_financial_truth(NEW.reservation_id);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Replace old trigger with hardened version
DROP TRIGGER IF EXISTS trg_update_reservation_paid_amount ON payments;

CREATE TRIGGER trg_update_reservation_paid_amount
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION trg_payment_financial_truth();

-- ============================================================================
-- 3. RESERVATION TOTAL_AMOUNT TRIGGER — Recalculate when total changes
--    Only fires on actual total_amount change (prevents recursion)
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_reservation_total_financial_truth()
RETURNS TRIGGER AS $$
BEGIN
    -- Only recalculate if total_amount actually changed
    IF OLD.total_amount IS DISTINCT FROM NEW.total_amount THEN
        PERFORM recalc_reservation_financial_truth(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_reservation_total_changed ON reservations;

CREATE TRIGGER trg_reservation_total_changed
    AFTER UPDATE ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION trg_reservation_total_financial_truth();

-- ============================================================================
-- 4. BACKFILL — Recalculate ALL existing reservations
-- ============================================================================

DO $$
DECLARE
    v_reservation RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_reservation IN SELECT id FROM reservations LOOP
        PERFORM recalc_reservation_financial_truth(v_reservation.id);
        v_count := v_count + 1;
    END LOOP;

    RAISE NOTICE '✅ Backfilled % reservations with canonical financial truth', v_count;
END $$;

-- ============================================================================
-- 5. VERIFICATION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Financial truth hardened:';
    RAISE NOTICE '   recalc_reservation_financial_truth(uuid) — canonical helper';
    RAISE NOTICE '   trg_payment_financial_truth — INSERT/UPDATE/DELETE on payments';
    RAISE NOTICE '   → recalculates OLD + NEW reservation when reservation_id changes';
    RAISE NOTICE '   trg_reservation_total_financial_truth — UPDATE on reservations';
    RAISE NOTICE '   → recalculates when total_amount changes (recursion-guarded)';
    RAISE NOTICE '   paid_amount = SUM(succeeded payments only)';
    RAISE NOTICE '   balance_due = max(total_amount - paid_amount, 0)';
    RAISE NOTICE '   payment_status: unpaid | partially_paid | paid';
    RAISE NOTICE '   Auto-completion: confirmed↔completed preserved';
END $$;
