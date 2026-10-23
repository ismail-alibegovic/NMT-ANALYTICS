/** Reject known privileged keys without ever including key material in errors. */
export function assertPublicSupabaseKey(key: string | undefined): void {
  if (!key) return; // Existing configuration validation handles missing values.
  const fail = () => { throw new Error('Privileged Supabase keys must not be used in VITE_SUPABASE_ANON_KEY'); };
  if (key.startsWith('sb_secret_')) fail();
  const parts = key.split('.');
  if (parts.length !== 3) return;
  let role: unknown;
  try {
    role = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))).role;
  } catch { return; } // Preserve compatibility with other public key formats.
  if (role === 'service_role') fail();
}
