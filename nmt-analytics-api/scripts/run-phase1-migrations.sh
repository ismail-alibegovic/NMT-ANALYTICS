#!/bin/bash

# Phase 1 Migration Runner
# Runs both required migrations for financial truth fields and currency consistency

set -e

echo "🚀 Phase 1 Migration Runner"
echo "======================================"
echo ""

# Check if we're in the right directory
if [ ! -f "supabase/sql/015_financial_truth_fields.sql" ]; then
    echo "❌ Error: Migration files not found"
    echo "Please run this script from the nmt-analytics-api directory"
    exit 1
fi

echo "✅ Migration files found"
echo ""

echo "📋 Migrations to run:"
echo "  1. 015_financial_truth_fields.sql"
echo "  2. 016_currency_consistency.sql"
echo ""

echo "⚠️  IMPORTANT: These migrations will:"
echo "  - Add balance_due and payment_status columns"
echo "  - Update database triggers"
echo "  - Change currency defaults to BAM"
echo "  - Backfill existing data"
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
echo "   - Open: https://app.supabase.com/project/YOUR_PROJECT/sql"
echo "   - Copy/paste SQL from migration files"
echo "   - Click 'Run'"
echo ""
echo "2. psql (Direct Database Connection)"
echo "   - Requires database connection string"
echo "   - Runs migrations automatically"
echo ""
echo "3. Supabase CLI"
echo "   - Requires: supabase CLI installed"
echo "   - Runs: supabase db push"
echo ""

read -p "Select option (1/2/3): " -n 1 -r
echo ""

case $REPLY in
    1)
        echo ""
        echo "======================================"
        echo "OPTION 1: SUPABASE DASHBOARD"
        echo "======================================"
        echo ""
        echo "📋 Step 1: Open Supabase Dashboard"
        echo "   https://app.supabase.com/project/YOUR_PROJECT/sql"
        echo ""
        echo "📋 Step 2: Copy Migration 1"
        echo "   File: supabase/sql/015_financial_truth_fields.sql"
        echo ""
        echo "Opening file in editor..."
        if command -v code &> /dev/null; then
            code supabase/sql/015_financial_truth_fields.sql
        elif command -v open &> /dev/null; then
            open supabase/sql/015_financial_truth_fields.sql
        else
            cat supabase/sql/015_financial_truth_fields.sql
        fi
        echo ""
        read -p "Press Enter after running Migration 1..."
        echo ""
        echo "📋 Step 3: Copy Migration 2"
        echo "   File: supabase/sql/016_currency_consistency.sql"
        echo ""
        echo "Opening file in editor..."
        if command -v code &> /dev/null; then
            code supabase/sql/016_currency_consistency.sql
        elif command -v open &> /dev/null; then
            open supabase/sql/016_currency_consistency.sql
        else
            cat supabase/sql/016_currency_consistency.sql
        fi
        echo ""
        read -p "Press Enter after running Migration 2..."
        echo ""
        echo "✅ Migrations should be complete!"
        ;;
    2)
        echo ""
        echo "======================================"
        echo "OPTION 2: PSQL"
        echo "======================================"
        echo ""
        read -p "Enter database connection string: " DB_URL
        echo ""
        echo "Running Migration 1..."
        psql "$DB_URL" -f supabase/sql/015_financial_truth_fields.sql
        echo ""
        echo "✅ Migration 1 complete"
        echo ""
        echo "Running Migration 2..."
        psql "$DB_URL" -f supabase/sql/016_currency_consistency.sql
        echo ""
        echo "✅ Migration 2 complete"
        ;;
    3)
        echo ""
        echo "======================================"
        echo "OPTION 3: SUPABASE CLI"
        echo "======================================"
        echo ""
        if ! command -v supabase &> /dev/null; then
            echo "❌ Error: Supabase CLI not found"
            echo "Install: npm install -g supabase"
            exit 1
        fi
        echo "Running: supabase db push"
        supabase db push
        echo ""
        echo "✅ Migrations complete"
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
echo "Run these SQL queries to verify:"
echo ""
echo "-- Check columns"
echo "SELECT column_name, data_type, column_default"
echo "FROM information_schema.columns"
echo "WHERE table_name = 'reservations'"
echo "  AND column_name IN ('balance_due', 'payment_status', 'currency');"
echo ""
echo "-- Check triggers"
echo "SELECT trigger_name"
echo "FROM information_schema.triggers"
echo "WHERE trigger_name IN ('trg_update_reservation_paid_amount', 'trg_validate_payment_currency');"
echo ""
echo "======================================"
echo "NEXT STEPS"
echo "======================================"
echo ""
echo "1. Run verification queries above"
echo "2. Review: PHASE1_QA_REPORT.md"
echo "3. Run end-to-end tests"
echo "4. Check frontend displays new fields"
echo ""
echo "✅ Migration runner complete!"
echo ""
