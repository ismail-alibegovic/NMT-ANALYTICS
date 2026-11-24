import api from "../lib/apiClient";

export type AssignableStaffRole = "director" | "manager" | "agent" | "viewer";

export interface StaffMember {
  id: string;
  email: string | null;
  fullName: string | null;
  role: string;
  createdAt: string | null;
  revokedAt: string | null;
  status: "active" | "revoked";
}

export interface TeamListResponse {
  members: StaffMember[];
  smtpRequired: boolean;
}

export interface CreateStaffInput {
  email: string;
  fullName: string;
  role: AssignableStaffRole;
  password?: string;
}

export interface CreateStaffResponse {
  member: StaffMember;
  initialPassword: string;
  smtpRequired: boolean;
}

export async function getTeamMembers(): Promise<TeamListResponse> {
  const { data } = await api.get<TeamListResponse>("/settings/team");
  return data;
}

export async function createTeamMember(payload: CreateStaffInput): Promise<CreateStaffResponse> {
  const { data } = await api.post<CreateStaffResponse>("/settings/team", payload);
  return data;
}

export async function updateTeamMemberRole(memberId: string, role: AssignableStaffRole): Promise<{ member: StaffMember }> {
  const { data } = await api.patch<{ member: StaffMember }>(`/settings/team/${memberId}/role`, { role });
  return data;
}

export async function revokeTeamMember(memberId: string): Promise<{ member: StaffMember }> {
  const { data } = await api.post<{ member: StaffMember }>(`/settings/team/${memberId}/revoke`);
  return data;
}

export async function reactivateTeamMember(memberId: string): Promise<{ member: StaffMember }> {
  const { data } = await api.post<{ member: StaffMember }>(`/settings/team/${memberId}/reactivate`);
  return data;
}
