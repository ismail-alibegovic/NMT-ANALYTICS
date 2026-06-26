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
