import { apiFetch, apiFetchPaginated } from "@/services/api/client";

export interface Notification {
  id: string;
  kind: string;
  severity: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationList {
  data: Notification[];
  meta: { page: number; page_size: number; total: number; pages: number };
}

export interface UnreadCount {
  count: number;
}

export async function listNotifications(
  page = 1,
  pageSize = 50,
  unreadOnly = false,
): Promise<NotificationList> {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("page_size", String(pageSize));
  if (unreadOnly) q.set("unread_only", "true");
  return apiFetchPaginated<Notification>(`/v1/notifications?${q.toString()}`);
}

export async function fetchUnreadCount(): Promise<number> {
  const { count } = await apiFetch<UnreadCount>("/v1/notifications/unread-count");
  return count;
}

export async function markNotificationRead(id: string): Promise<Notification> {
  return apiFetch<Notification>(`/v1/notifications/${id}/read`, { method: "POST" });
}

export async function markAllNotificationsRead(): Promise<number> {
  const { count } = await apiFetch<UnreadCount>("/v1/notifications/read-all", { method: "POST" });
  return count;
}
