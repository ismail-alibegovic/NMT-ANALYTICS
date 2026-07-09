-- ============================================================================
-- PAYMENT BACKFILL MIGRATION
-- Date: 2026-01-15
-- Purpose: Create adjustment payment records for reservations with paid_amount
--          but no corresponding payment rows (legacy data from CSV imports)
-- ============================================================================

-- ============================================================================
-- IMPORTANT: Run this AFTER 015_financial_truth_fields.sql
-- This ensures the trigger exists to recalculate totals
-- ============================================================================

DO $$
DECLARE
    v_reservation RECORD;
    v_payment_count INTEGER;
    v_new_payment_id UUID;
    v_total_created INTEGER := 0;
    v_total_skipped INTEGER := 0;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Payment Backfill Migration ===';
    RAISE NOTICE 'Finding reservations with paid_amount > 0 but no payment records...';
    RAISE NOTICE '';

    -- Loop through all reservations with paid_amount > 0
    FOR v_reservation IN
        SELECT 
            r.id,
            r.org_id,
            r.paid_amount,
            r.currency,
            r.created_at,
            r.customer_name
        FROM reservations r
        WHERE r.paid_amount > 0
        ORDER BY r.created_at
    LOOP
        -- Check if there are any succeeded payments for this reservation
        SELECT COUNT(*) INTO v_payment_count
        FROM payments
        WHERE reservation_id = v_reservation.id
          AND status = 'succeeded';

        -- If no succeeded payments exist, create an adjustment payment
        IF v_payment_count = 0 THEN
            -- Generate new UUID for payment
            v_new_payment_id := gen_random_uuid();

            -- Insert adjustment payment
            INSERT INTO payments (
                id,
                reservation_id,
                org_id,
                amount,
                currency,
                status,
                payment_date,
                created_at,
                updated_at
            ) VALUES (
                v_new_payment_id,
                v_reservation.id,
                v_reservation.org_id,
                v_reservation.paid_amount,
                COALESCE(v_reservation.currency, 'BAM'),
                'succeeded',
                v_reservation.created_at::date,  -- Use reservation creation date
                NOW(),
                NOW()
            );

            v_total_created := v_total_created + 1;

            RAISE NOTICE 'Created adjustment payment for reservation: % (Customer: %, Amount: %)',
                v_reservation.id,
                v_reservation.customer_name,
                v_reservation.paid_amount;
        ELSE
            v_total_skipped := v_total_skipped + 1;
        END IF;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '=== Migration Complete ===';
    RAISE NOTICE 'Adjustment payments created: %', v_total_created;
    RAISE NOTICE 'Reservations skipped (already have payments): %', v_total_skipped;
    RAISE NOTICE '';

    -- Verify the results
    RAISE NOTICE '=== Verification ===';
    RAISE NOTICE 'Checking for remaining inconsistencies...';
    
    DECLARE
        v_inconsistent_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_inconsistent_count
        FROM reservations r
        WHERE r.paid_amount > 0
          AND NOT EXISTS (
              SELECT 1 FROM payments p
              WHERE p.reservation_id = r.id
                AND p.status = 'succeeded'
          );

        IF v_inconsistent_count > 0 THEN
            RAISE WARNING '⚠️  Still found % reservations with paid_amount > 0 but no succeeded payments', v_inconsistent_count;
        ELSE
            RAISE NOTICE '✅ All reservations with paid_amount > 0 now have corresponding payment records';
        END IF;
    END;

    -- Show sample of created adjustments
    RAISE NOTICE '';
    RAISE NOTICE '=== Sample of Created Adjustment Payments ===';
    FOR v_reservation IN
        SELECT 
            p.id as payment_id,
            r.id as reservation_id,
            r.customer_name,
            p.amount,
            p.currency,
            p.payment_date,
            p.created_at
        FROM payments p
        JOIN reservations r ON r.id = p.reservation_id
        WHERE p.created_at >= NOW() - INTERVAL '1 minute'
        ORDER BY p.created_at DESC
        LIMIT 5
    LOOP
        RAISE NOTICE 'Payment ID: %, Reservation: % (%), Amount: % %, Date: %',
            v_reservation.payment_id,
            v_reservation.reservation_id,
            v_reservation.customer_name,
            v_reservation.amount,
            v_reservation.currency,
            v_reservation.payment_date;
    END LOOP;

END $$;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Check for any remaining inconsistencies
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Final Verification ===';
    
    -- Check 1: Reservations with paid_amount but no payments
    SELECT COUNT(*) INTO v_count
    FROM reservations r
    WHERE r.paid_amount > 0
      AND NOT EXISTS (
          SELECT 1 FROM payments p
          WHERE p.reservation_id = r.id AND p.status = 'succeeded'
      );
    
    IF v_count > 0 THEN
        RAISE WARNING '❌ Found % reservations with paid_amount > 0 but no succeeded payments', v_count;
    ELSE
        RAISE NOTICE '✅ All reservations with paid_amount have corresponding payments';
    END IF;

    -- Check 2: Verify trigger recalculation worked
    SELECT COUNT(*) INTO v_count
    FROM reservations r
    WHERE r.paid_amount > 0
      AND r.balance_due IS NULL;
    
    IF v_count > 0 THEN
        RAISE WARNING '❌ Found % reservations with NULL balance_due (trigger may not have fired)', v_count;
    ELSE
        RAISE NOTICE '✅ All reservations have balance_due calculated';
    END IF;

    -- Check 3: Verify payment_status is set
    SELECT COUNT(*) INTO v_count
    FROM reservations r
    WHERE r.paid_amount > 0
      AND r.payment_status IS NULL;
    
    IF v_count > 0 THEN
        RAISE WARNING '❌ Found % reservations with NULL payment_status (trigger may not have fired)', v_count;
    ELSE
        RAISE NOTICE '✅ All reservations have payment_status calculated';
    END IF;

    RAISE NOTICE '';
END $$;

-- ============================================================================
-- MANUAL VERIFICATION QUERIES
-- ============================================================================

-- Run these queries manually to verify the migration:

-- 1. Check specific reservation (replace with actual ID)
-- SELECT 
--     r.id,
--     r.customer_name,
--     r.total_amount,
--     r.paid_amount,
--     r.balance_due,
--     r.payment_status,
--     (SELECT COUNT(*) FROM payments WHERE reservation_id = r.id AND status = 'succeeded') as payment_count,
--     (SELECT SUM(amount) FROM payments WHERE reservation_id = r.id AND status = 'succeeded') as payment_sum
-- FROM reservations r
-- WHERE r.id = 'e62d416f-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

-- 2. List all adjustment payments created
-- SELECT 
--     p.id,
--     p.reservation_id,
--     r.customer_name,
--     p.amount,
--     p.currency,
--     p.status,
--     p.payment_date,
--     p.created_at
-- FROM payments p
-- JOIN reservations r ON r.id = p.reservation_id
-- WHERE p.created_at >= NOW() - INTERVAL '1 hour'
-- ORDER BY p.created_at DESC;

-- 3. Verify no inconsistencies remain
-- SELECT 
--     r.id,
--     r.customer_name,
--     r.paid_amount,
--     COALESCE((SELECT SUM(amount) FROM payments WHERE reservation_id = r.id AND status = 'succeeded'), 0) as calculated_paid,
--     r.paid_amount - COALESCE((SELECT SUM(amount) FROM payments WHERE reservation_id = r.id AND status = 'succeeded'), 0) as difference
-- FROM reservations r
-- WHERE r.paid_amount > 0
--   AND ABS(r.paid_amount - COALESCE((SELECT SUM(amount) FROM payments WHERE reservation_id = r.id AND status = 'succeeded'), 0)) > 0.01
-- ORDER BY difference DESC;

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- To rollback this migration (delete adjustment payments created in last hour):
-- DELETE FROM payments
-- WHERE created_at >= NOW() - INTERVAL '1 hour'
--   AND updated_at = created_at  -- Only delete newly created records
--   AND EXISTS (
--       SELECT 1 FROM reservations r
--       WHERE r.id = payments.reservation_id
--         AND payments.amount = r.paid_amount
--   );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Payment backfill migration completed successfully';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Verify the results using the queries above';
    RAISE NOTICE '2. Test PaymentsModal for affected reservations';
    RAISE NOTICE '3. Confirm payment history now shows correctly';
    RAISE NOTICE '';
END $$;
