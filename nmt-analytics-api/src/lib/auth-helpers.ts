import { supabaseAdmin } from '../lib/supabase';
import { Request } from 'express';

export interface UserProfile {
  org_id: string | null;
  role: string;
}

export interface UserContext {
  userId: string;
  email: string;
  orgId: string;
  role: string;
  org: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface OrgContext {
  userId: string;
  orgId: string;
  role: string;
}

/**
 * Fetch user profile from Supabase
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('org_id, role')
    .eq('id', userId)
    .single();

  if (error || !data) {
    console.error('Error fetching user profile:', error);
    return null;
  }

  return data as UserProfile;
}

/**
 * Get complete user context including organization details
 */
export async function getUserContext(userId: string, email: string): Promise<UserContext> {
  // Get profile with organization
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(
      `
      role,
      org_id,
      organizations (
        id,
        name,
        slug
      )
    `
    )
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
    email,
    orgId: profile.org_id,
    role: profile.role,
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
    },
  };
}

/**
 * Get organization context from authenticated request
 */
export async function getOrgContext(req: Request): Promise<OrgContext> {
  if (!req.user) {
    throw new Error('User not authenticated');
  }

  const profile = await getUserProfile(req.user.id);

  if (!profile) {
    throw new Error('User profile not found');
  }

  if (!profile.org_id) {
    throw new Error('User not assigned to an organization');
  }

  return {
    userId: req.user.id,
    orgId: profile.org_id,
    role: profile.role,
  };
}

/**
 * Helper to ensure Supabase queries are org-scoped
 * Usage: requireOrgScope(queryBuilder, orgId)
 * Example: requireOrgScope(supabaseAdmin.from('customers').select('*'), orgId)
 */
export function requireOrgScope<T>(queryBuilder: T, orgId: string): T {
  if (!orgId) {
    throw new Error('Organization ID is required for this operation');
  }

  // This is a type-safe helper - the actual filtering must be done by the caller
  // using .eq('org_id', orgId) on the queryBuilder
  return queryBuilder;
}
