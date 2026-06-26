import { supabase } from '../lib/supabase';

/**
 * Get the current access token from Supabase session
 * @returns The access token string or null if no session
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('[auth] Failed to get session:', error);
      return null;
    }
    return session?.access_token || null;
  } catch (error) {
    console.error('[auth] Failed to get access token:', error);
    return null;
  }
}
