import { post } from './client';

export interface AutoAssignResult {
  assigned: number;
  preserved: number;
  unassigned: number;
  results: Array<{ passengerId: string; seat: number }>;
}

export interface GroupAssignPreview {
  preview?: boolean;
  applied?: number;
  count: number;
  split: boolean;
  assignments: Array<{ passengerId: string; seat: number }>;
}

export async function autoAssignAll(departureId: string, transportType?: string): Promise<AutoAssignResult> {
  const { data } = await post<AutoAssignResult>('/seats/auto-assign', { departureId, transportType });
  return data;
}

export async function previewAssignGroup(groupId: string, departureId: string, transportType?: string): Promise<GroupAssignPreview> {
  const { data } = await post<GroupAssignPreview>(`/seats/group-auto-assign/${groupId}`, { departureId, transportType, apply: false });
  return data;
}

export async function applyAssignGroup(groupId: string, departureId: string, transportType?: string): Promise<GroupAssignPreview> {
  const { data } = await post<GroupAssignPreview>(`/seats/group-auto-assign/${groupId}`, { departureId, transportType, apply: true });
  return data;
}

export async function clearAllSeats(departureId: string): Promise<{ cleared: boolean }> {
  const { data } = await post<{ cleared: boolean }>('/seats/clear-all', { departureId });
  return data;
}
