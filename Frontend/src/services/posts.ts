import { api } from "@/lib/api";

/** Typed wrappers for the community posts endpoints. */

export const getPosts = <T = unknown>() => api.get<T>("/api/posts");
export const getNearbyPosts = <T = unknown>(bbox: string, opts?: RequestInit) =>
    api.get<T>(`/api/posts/nearby?bbox=${encodeURIComponent(bbox)}`, opts);
export const deletePost = (id: number | string) => api.delete(`/api/posts/${id}`);
