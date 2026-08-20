import { get } from './client';

export interface UserProfile {
  userId: string;
  email: string;
  org: {
    id: string;
    name: string;
    slug: string;
  };
  role: string;
}

export interface UserContext {
  user: {
    id: string;
    email: string;
  };
  org: {
    id: string;
    name: string;
    slug: string;
  };
  role: string;
  modules: string[];
  agencyProfiles: string[];
  capabilities: string[];
  agencyProfileConfigured: boolean;
}

/**
 * Get current user profile from /me endpoint
 */
export async function getMe(): Promise<UserProfile> {
  const { data } = await get<UserProfile>('/me');
  return data;
}

/**
 * Get current user context including organization, role, and enabled modules
 */
export async function getMeContext(): Promise<UserContext> {
  const { data } = await get<UserContext>('/me/context');
  return data;
}
