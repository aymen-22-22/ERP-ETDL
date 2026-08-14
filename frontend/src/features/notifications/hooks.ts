import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./api";

const NOTIFICATIONS_KEY = "notifications" as const;
const UNREAD_COUNT_KEY = "notifications-unread-count" as const;

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: [NOTIFICATIONS_KEY, unreadOnly],
    queryFn: () => listNotifications(1, 50, unreadOnly),
    refetchInterval: 60_000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: [UNREAD_COUNT_KEY],
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [UNREAD_COUNT_KEY] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [UNREAD_COUNT_KEY] });
    },
  });
}
