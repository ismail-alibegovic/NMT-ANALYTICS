import { createClient } from '@supabase/supabase-js';
import '../environment';
import path from 'path';
import { Response } from 'express';

const supabaseUrl = process.env.TRAVLINE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.TRAVLINE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.TRAVLINE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// 2. Debug Logging (Server Start)
console.error('--- Supabase Configuration Check ---');
console.error('Current Dir:', __dirname);
console.error('Project Root (inferred):', path.resolve(__dirname, '../../'));
console.error('URL:', supabaseUrl ? '✅ Loaded' : '❌ MISSING');
console.error('Anon Key:', supabaseAnonKey ? '✅ Loaded' : '❌ MISSING');
console.error('Service Role Key:', supabaseServiceKey ? '✅ Loaded' : '❌ MISSING');
console.error('------------------------------------');

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
  // PostgreSQL/provider details can contain row values and credentials.
  const logCode = typeof error?.code === 'string' && /^(?:[A-Z0-9]{5}|PGRST[0-9]{3})$/.test(error.code)
    ? error.code : 'DATABASE_ERROR';
  const transportFailure = typeof error?.message === 'string'
    && /^(?:TypeError: fetch failed|FetchError:|AbortError:)/.test(error.message);
  console.error(JSON.stringify({ event: 'database_failure', code: logCode,
    category: transportFailure ? 'transport' : logCode === 'DATABASE_ERROR' ? 'unknown' : 'database',
  }));
  // Normalize pg/supabase errors
  const code = error.code || 'DATABASE_ERROR';
  if (code === 'PGRST116') return res.status(404).json({ code: 'NOT_FOUND', message: 'Resource not found' });
  // Database diagnostics stay server-side; they can contain row values and SQL.
  return res.status(500).json({ message, code });
}
