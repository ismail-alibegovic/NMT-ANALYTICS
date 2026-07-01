-- ============================================================================
-- AUTO-RESERVATION STATUS ON FULL PAYMENT
-- Date: 2026-06-30
-- Purpose: Auto-update reservation status when fully paid or underpaid
-- ============================================================================

-- Extend the existing function to auto-update status
CREATE OR REPLACE FUNCTION update_reservation_paid_amount()
RETURNS TRIGGER AS $$
DECLARE
    v_reservation_id UUID;
    v_new_paid_amount NUMERIC(12,2);
    v_total_amount NUMERIC(12,2);
    v_current_status TEXT;
BEGIN
    -- Determine affected reservation
    v_reservation_id := COALESCE(NEW.reservation_id, OLD.reservation_id);

    -- Calculate new paid_amount
    SELECT COALESCE(SUM(amount), 0)
    INTO v_new_paid_amount
    FROM payments
    WHERE reservation_id = v_reservation_id
      AND status = 'succeeded';

    -- Update paid_amount on reservation
    UPDATE reservations
    SET paid_amount = v_new_paid_amount
    WHERE id = v_reservation_id;

    -- Auto-update status based on payment state
    SELECT total_amount, status INTO v_total_amount, v_current_status
    FROM reservations
    WHERE id = v_reservation_id;

    -- Fully paid → completed (only if currently confirmed)
    IF v_new_paid_amount >= v_total_amount AND v_current_status = 'confirmed' THEN
        UPDATE reservations
        SET status = 'completed'
        WHERE id = v_reservation_id
          AND status = 'confirmed';
    END IF;

    -- If unpaid/underpaid and currently completed → revert to confirmed
    IF v_new_paid_amount < v_total_amount AND v_current_status = 'completed' THEN
        UPDATE reservations
        SET status = 'confirmed'
        WHERE id = v_reservation_id
          AND status = 'completed';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verification
DO $$
BEGIN
    RAISE NOTICE '✅ Auto-reservation status trigger updated successfully';
END $$;
