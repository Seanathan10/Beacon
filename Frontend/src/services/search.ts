import { api } from "@/lib/api";

/** Typed wrappers for content search and per-user search history. */

export const searchContent = <T = unknown>(query: string, opts?: RequestInit) =>
    api.get<T>(`/api/search?q=${encodeURIComponent(query)}`, opts);

export const getSearchHistory = <T = unknown>() => api.get<T>("/api/search/history");
export const addSearchHistory = <T = unknown>(query: string) =>
    api.post<T>("/api/search/history", { query });
export const deleteSearchHistoryEntry = (id: number | string) =>
    api.delete(`/api/search/history/${id}`);
export const clearSearchHistory = () => api.delete("/api/search/history");
