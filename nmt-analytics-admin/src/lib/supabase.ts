import { createClient } from '@supabase/supabase-js';
import { assertPublicSupabaseKey } from './publicSupabaseKey';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL in environment variables');
}

if (!supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY in environment variables');
}

assertPublicSupabaseKey(supabaseAnonKey);

// Preserve only redirect intent, never tokens. Auth initialization can consume the URL
// before lazy auth screens mount, so subscribing in the screen alone loses recovery events.
const initialHash = new URLSearchParams(window.location.hash.slice(1));
const initialQuery = new URLSearchParams(window.location.search);
const recoveryRedirect = {
  requested: initialHash.get('type') === 'recovery',
  error: ['error', 'error_code'].some(key => initialHash.has(key) || initialQuery.has(key)),
};
export function getRecoveryRedirectState() { return { ...recoveryRedirect }; }

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});


supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session) {
    recoveryRedirect.requested = true;
    recoveryRedirect.error = false;
  } else if (event === 'SIGNED_OUT') {
    recoveryRedirect.requested = false;
  }
});
