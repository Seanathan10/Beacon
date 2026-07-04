import { api } from "@/lib/api";

/** Typed wrappers for notifications. */

export const getUnreadCount = <T = { count: number }>(opts?: RequestInit) =>
    api.get<T>("/api/notifications/unread-count", opts);
