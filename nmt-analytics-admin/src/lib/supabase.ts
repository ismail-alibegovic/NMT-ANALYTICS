import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL in environment variables');
}

if (!supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY in environment variables');
}

// DEV-ONLY: Validate that we're not using service_role key in the browser
if (import.meta.env.DEV) {
  try {
    // Decode JWT payload (middle part of JWT: header.payload.signature)
    const parts = supabaseAnonKey.split('.');
    if (parts.length === 3) {
      // Base64url decode the payload
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

      if (payload.role === 'service_role') {
        console.error('🚨 CRITICAL SECURITY ERROR 🚨');
        console.error('Misconfigured Supabase key: service_role key detected in browser!');
        console.error('This is a MAJOR security risk. The service_role key bypasses ALL Row Level Security.');
        console.error('');
        console.error('ACTION REQUIRED:');
        console.error('1. Go to your Supabase project dashboard');
        console.error('2. Navigate to Settings > API');
        console.error('3. Copy the "anon" / "public" key (NOT service_role)');
        console.error('4. Update VITE_SUPABASE_ANON_KEY in your .env file');
        console.error('');
        throw new Error('SECURITY: service_role key used in browser. Replace with anon/public key from Supabase settings.');
      }

      if (payload.role === 'anon') {
        logger.log('✅ Supabase: Using correct anon key in browser');
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('SECURITY')) {
      throw e; // Re-throw security errors
    }
    // Ignore JWT decode errors (key might be in different format)
    logger.warn('Could not validate Supabase key format:', e);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
