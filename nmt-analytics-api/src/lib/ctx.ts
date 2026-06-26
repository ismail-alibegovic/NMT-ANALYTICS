import { supabaseAdmin } from './supabase';

export interface OrgContext {
  userId: string;
  orgId: string;
  role: string;
  org: {
    id: string;
    name: string;
    slug: string;
  };
}

/**
 * Get complete organization context for a user
 * Throws errors for missing profile or organization
 */
export async function getOrgContext(userId: string): Promise<OrgContext> {
  // Get profile with organization
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(`
      role,
      org_id,
      organizations (
        id,
        name,
        slug
      )
    `)
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    throw new Error('User profile not found');
  }

  if (!profile.org_id) {
    throw new Error('User not assigned to an organization');
  }

  if (!profile.organizations) {
    throw new Error('Organization not found');
  }

  const org = profile.organizations as any;

  return {
    userId,
    orgId: profile.org_id,
    role: profile.role,
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
    },
  };
}
