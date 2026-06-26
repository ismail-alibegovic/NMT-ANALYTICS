#!/bin/bash

# Financial Truth Fields Migration Runner
# Runs the 015_financial_truth_fields.sql migration

set -e

echo "🚀 Running Financial Truth Fields Migration..."
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if SUPABASE_URL is set
if [ -z "$SUPABASE_URL" ]; then
    echo "❌ Error: SUPABASE_URL not set in .env"
    exit 1
fi

# Extract database connection details from Supabase URL
# Note: This assumes you have direct database access
# For Supabase, you might need to use their CLI or API

echo "📋 Migration file: supabase/sql/015_financial_truth_fields.sql"
echo ""
echo "⚠️  This migration will:"
echo "   1. Add balance_due column to reservations"
echo "   2. Add payment_status column to reservations"
echo "   3. Remove paid_amount <= total_amount constraint"
echo "   4. Update trigger to auto-calculate financial truth"
echo "   5. Backfill existing reservations"
echo ""

# Check if migration file exists
if [ ! -f "supabase/sql/015_financial_truth_fields.sql" ]; then
    echo "❌ Error: Migration file not found"
    exit 1
fi

echo "✅ Migration file found"
echo ""
echo "📝 To run this migration, you have several options:"
echo ""
echo "Option 1: Using Supabase CLI (recommended)"
echo "  supabase db push"
echo ""
echo "Option 2: Using psql directly"
echo "  psql <connection_string> -f supabase/sql/015_financial_truth_fields.sql"
echo ""
echo "Option 3: Copy/paste SQL into Supabase Dashboard"
echo "  1. Go to: https://app.supabase.com/project/<project>/sql"
echo "  2. Paste contents of: supabase/sql/015_financial_truth_fields.sql"
echo "  3. Click 'Run'"
echo ""
echo "Option 4: Using Node.js script (see below)"
echo ""

# Create a Node.js migration runner
cat > scripts/run-migration-015.js << 'EOF'
/**
 * Migration Runner for 015_financial_truth_fields.sql
 * 
 * Usage: node scripts/run-migration-015.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
    console.log('🚀 Running Financial Truth Fields Migration...\n');

    // Initialize Supabase client with service role key
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        console.error('❌ Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Read migration file
    const migrationPath = path.join(__dirname, '../supabase/sql/015_financial_truth_fields.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📋 Migration file loaded');
    console.log('📏 SQL size:', migrationSQL.length, 'bytes\n');

    try {
        // Note: Supabase client doesn't support raw SQL execution directly
        // You'll need to use the Supabase Management API or psql
        console.log('⚠️  Supabase JS client cannot execute raw SQL migrations.');
        console.log('');
        console.log('Please use one of these methods instead:');
        console.log('');
        console.log('1. Supabase Dashboard SQL Editor:');
        console.log('   https://app.supabase.com/project/<project>/sql');
        console.log('');
        console.log('2. Supabase CLI:');
        console.log('   supabase db push');
        console.log('');
        console.log('3. Direct PostgreSQL connection:');
        console.log('   psql <connection_string> -f supabase/sql/015_financial_truth_fields.sql');
        console.log('');
        
        // Show the SQL for easy copy/paste
        console.log('📄 SQL Preview (first 500 chars):');
        console.log('─'.repeat(80));
        console.log(migrationSQL.substring(0, 500) + '...');
        console.log('─'.repeat(80));
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runMigration();
EOF

echo "✅ Created Node.js migration runner: scripts/run-migration-015.js"
echo ""
echo "To run using Node.js:"
echo "  node scripts/run-migration-015.js"
echo ""
