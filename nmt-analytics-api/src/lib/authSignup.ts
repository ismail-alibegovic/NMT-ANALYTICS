import { createClient } from '@supabase/supabase-js';

export function signupRedirectUrl(): string {
  const configured = process.env.ADMIN_URL;
  if (!configured) throw new Error('AUTH_REDIRECT_NOT_CONFIGURED');
  const url = new URL(configured);
  if (url.username || url.password || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
    throw new Error('AUTH_REDIRECT_INVALID');
  }
  return new URL('/auth/signin', url.origin).href;
}

export function createSignupClient() {
  return createClient(
    (process.env.TRAVLINE_SUPABASE_URL || process.env.SUPABASE_URL)!,
    (process.env.TRAVLINE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY)!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
