#!/bin/bash

# Payment Backfill Migration Runner
# Fixes data consistency issue where reservations have paid_amount but no payment records

set -e

echo "🔧 Payment Backfill Migration"
echo "======================================"
echo ""

# Check if migration file exists
if [ ! -f "supabase/sql/017_payment_backfill.sql" ]; then
    echo "❌ Error: Migration file not found"
    echo "Please run this script from the nmt-analytics-api directory"
    exit 1
fi

echo "✅ Migration file found"
echo ""

echo "📋 This migration will:"
echo "  - Find reservations with paid_amount > 0"
echo "  - Check if they have zero payment records"
echo "  - Create adjustment payment rows for missing payments"
echo "  - Trigger will recalculate totals automatically"
echo ""

echo "⚠️  IMPORTANT:"
echo "  - This should be run AFTER 015_financial_truth_fields.sql"
echo "  - This is a ONE-TIME migration"
echo "  - Safe to run multiple times (idempotent)"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Migration cancelled"
    exit 1
fi

echo ""
echo "======================================"
echo "MIGRATION OPTIONS"
echo "======================================"
echo ""
echo "Choose your migration method:"
echo ""
echo "1. Supabase Dashboard (Recommended)"
echo "   - Visual feedback"
echo "   - Easy to review output"
echo ""
echo "2. psql (Direct Database Connection)"
echo "   - Requires connection string"
echo "   - Automatic execution"
echo ""

read -p "Select option (1/2): " -n 1 -r
echo ""

case $REPLY in
    1)
        echo ""
        echo "======================================"
        echo "OPTION 1: SUPABASE DASHBOARD"
        echo "======================================"
        echo ""
        echo "📋 Steps:"
        echo "1. Open: https://app.supabase.com/project/YOUR_PROJECT/sql"
        echo "2. Copy the contents of: supabase/sql/017_payment_backfill.sql"
        echo "3. Paste into SQL Editor"
        echo "4. Click 'Run'"
        echo "5. Review the output messages"
        echo ""
        echo "Opening migration file..."
        if command -v code &> /dev/null; then
            code supabase/sql/017_payment_backfill.sql
        elif command -v open &> /dev/null; then
            open supabase/sql/017_payment_backfill.sql
        else
            echo ""
            echo "File contents:"
            echo "======================================"
            head -n 50 supabase/sql/017_payment_backfill.sql
            echo "..."
            echo "======================================"
        fi
        echo ""
        read -p "Press Enter after running the migration..."
        ;;
    2)
        echo ""
        echo "======================================"
        echo "OPTION 2: PSQL"
        echo "======================================"
        echo ""
        read -p "Enter database connection string: " DB_URL
        echo ""
        echo "Running migration..."
        psql "$DB_URL" -f supabase/sql/017_payment_backfill.sql
        echo ""
        echo "✅ Migration complete"
        ;;
    *)
        echo "❌ Invalid option"
        exit 1
        ;;
esac

echo ""
echo "======================================"
echo "VERIFICATION"
echo "======================================"
echo ""
echo "Run these queries to verify:"
echo ""
echo "-- 1. Check Dino Alić reservation"
echo "SELECT "
echo "    r.id,"
echo "    r.customer_name,"
echo "    r.paid_amount,"
echo "    (SELECT COUNT(*) FROM payments WHERE reservation_id = r.id AND status = 'succeeded') as payment_count"
echo "FROM reservations r"
echo "WHERE r.customer_name LIKE '%Dino Alić%';"
echo ""
echo "-- 2. Check for remaining inconsistencies"
echo "SELECT COUNT(*) as inconsistent_count"
echo "FROM reservations r"
echo "WHERE r.paid_amount > 0"
echo "  AND NOT EXISTS ("
echo "      SELECT 1 FROM payments p"
echo "      WHERE p.reservation_id = r.id AND p.status = 'succeeded'"
echo "  );"
echo ""
echo "Expected: payment_count = 1, inconsistent_count = 0"
echo ""
echo "======================================"
echo "NEXT STEPS"
echo "======================================"
echo ""
echo "1. Run verification queries above"
echo "2. Open Reservations page in UI"
echo "3. Find Dino Alić reservation"
echo "4. Click 'Plaćanja' button"
echo "5. Verify payment history shows 200 BAM payment"
echo ""
echo "✅ Migration runner complete!"
echo ""
