import { api } from "@/lib/api";

/** Typed wrappers for user profiles, the follow graph, and the current account. */

export const getUser = <T = unknown>(userID: number | string) => api.get<T>(`/api/users/${userID}`);
export const getUserPins = <T = unknown>(userID: number | string, page = 1) =>
    api.get<T>(`/api/users/${userID}/pins?page=${page}`);
export const getUserFollowers = <T = unknown>(userID: number | string, page = 1) =>
    api.get<T>(`/api/users/${userID}/followers?page=${page}`);
export const getUserFollowing = <T = unknown>(userID: number | string, page = 1) =>
    api.get<T>(`/api/users/${userID}/following?page=${page}`);

export const followUser = (userID: number | string) => api.post(`/api/users/${userID}/follow`);
export const unfollowUser = (userID: number | string) => api.delete(`/api/users/${userID}/follow`);

export const updateMe = <T = unknown>(body: { bio?: string | null; avatar?: string | null; profileVisibility?: string }) =>
    api.patch<T>("/api/me", body);

export const getFollowFeed = <T = unknown>(cursor?: number | null) =>
    api.get<T>(`/api/me/feed${cursor ? `?cursor=${cursor}` : ""}`);
