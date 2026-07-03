import { api } from "@/lib/api";

/** Typed wrappers for notifications. */

export const getUnreadCount = <T = { count: number }>() => api.get<T>("/api/notifications/unread-count");
export const getNotifications = <T = unknown>(cursor?: number | null, opts?: RequestInit) =>
    api.get<T>(`/api/notifications${cursor ? `?cursor=${cursor}` : ""}`, opts);
export const markRead = (ids?: number[]) => api.post("/api/notifications/read", ids ? { ids } : {});
