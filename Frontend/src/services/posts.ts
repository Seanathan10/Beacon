import { api } from "@/lib/api";

/** Typed wrappers for the community posts endpoints. */

export const getNearbyPosts = <T = unknown>(bbox: string, opts?: RequestInit) =>
    api.get<T>(`/api/posts/nearby?bbox=${encodeURIComponent(bbox)}`, opts);
