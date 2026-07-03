import { api } from "@/lib/api";

/** Typed wrappers for notifications. */

export const getUnreadCount = <T = { count: number }>(opts?: RequestInit) =>
    api.get<T>("/api/notifications/unread-count", opts);
export const getNotifications = <T = unknown>(cursor?: number | null, opts?: RequestInit) =>
    api.get<T>(`/api/notifications${cursor ? `?cursor=${cursor}` : ""}`, opts);
export const markRead = (ids?: number[]) => api.post("/api/notifications/read", ids ? { ids } : {});
