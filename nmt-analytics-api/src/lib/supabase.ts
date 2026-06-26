import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { Response } from 'express';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({
    path: path.resolve(__dirname, '../../.env'),
    override: true,
  });
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 2. Debug Logging (Server Start)
console.log('--- Supabase Configuration Check ---');
console.log('Current Dir:', __dirname);
console.log('Project Root (inferred):', path.resolve(__dirname, '../../'));
console.log('URL:', supabaseUrl ? '✅ Loaded' : '❌ MISSING');
console.log('Anon Key:', supabaseAnonKey ? '✅ Loaded' : '❌ MISSING');
console.log('Service Role Key:', supabaseServiceKey ? '✅ Loaded' : '❌ MISSING');
console.log('------------------------------------');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL: Supabase URL or Anon Key is missing from process.env');
}

// 3. Export Clients
export const supabase = createClient(supabaseUrl!, supabaseAnonKey!);

// Create Admin client strictly if key exists
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl!, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
  : supabase; // Fallback (but will log missing key above)

/**
 * Helper to standardise Supabase error responses
 */
export function handleSupabaseError(res: Response, error: any, message = 'Database operation failed') {
  console.error(`[Supabase Error] ${message}:`, error);
  // Normalize pg/supabase errors
  const code = error.code || 'DATABASE_ERROR';
  const details = error.details || error.message || String(error);
  const hint = error.hint || undefined;

  return res.status(500).json({
    message,
    code,
    details,
    hint
  });
}
