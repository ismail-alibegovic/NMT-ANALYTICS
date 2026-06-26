import { get, patch } from './client';

export type NotificationType =
  | 'new_reservation'
  | 'payment_received'
  | 'departure_reminder'
  | 'payment_overdue'
  | 'system';

export interface Notification {
  id: string;
  orgId: string;
  userId: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  data: Notification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getNotifications(params: { page?: number; limit?: number } = {}): Promise<NotificationsResponse> {
  const { data } = await get<NotificationsResponse>('/notifications', { params });
  return data;
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { data } = await get<{ count: number }>('/notifications/unread-count');
  return data.count;
}

export async function markNotificationAsRead(id: string): Promise<void> {
  await patch(`/notifications/${id}/read`);
}

export async function markAllNotificationsAsRead(): Promise<void> {
  await patch('/notifications/read-all');
}
