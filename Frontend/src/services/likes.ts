import { api } from "@/lib/api";

/** Typed wrappers for pin likes. */

export const getLikedPins = <T = unknown>() => api.get<T>("/api/likes/user");
export const getLikes = <T = { likes: number; wasLiked: boolean }>(pinId: number | string) =>
    api.get<T>(`/api/likes/${pinId}`);
export const addLike = (pinId: number | string) => api.post(`/api/likes/${pinId}`);
export const removeLike = (pinId: number | string) => api.delete(`/api/likes/${pinId}`);
