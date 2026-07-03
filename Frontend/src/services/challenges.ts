import { api } from "@/lib/api";

/** Typed wrappers for eco-challenges and the community leaderboard. */

export const getMyChallenges = <T = unknown>(opts?: RequestInit) => api.get<T>("/api/me/challenges", opts);
export const getLeaderboard = <T = unknown>(opts?: RequestInit) => api.get<T>("/api/leaderboard", opts);
