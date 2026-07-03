import { api } from "@/lib/api";

/** Typed wrappers for the current user's stats and activity. */

export const getMyStats = <T = unknown>() => api.get<T>("/api/me/stats");
export const getMyActivity = <T = unknown>() => api.get<T>("/api/me/activity");
