import { api } from "@/lib/api";

/** Typed wrappers for eco-challenges and the community leaderboard. */

export const getMyChallenges = <T = unknown>() => api.get<T>("/api/me/challenges");
export const getLeaderboard = <T = unknown>() => api.get<T>("/api/leaderboard");
