import { api } from "@/lib/api";

/**
 * Typed wrappers for trip planning, saved trips, carbon stats and sharing.
 * Note: the SSE endpoint /api/trip/plan/stream is consumed with a streaming
 * fetch in TripPlanner and is not wrapped here (the api client returns parsed
 * JSON, not a stream).
 */

export const getMyTrip = <T = unknown>(id: string) => api.get<T>(`/api/me/trips/${id}`);
export const getCarbonStats = <T = unknown>(opts?: RequestInit) => api.get<T>("/api/me/carbon-stats", opts);

export const askQuestion = <T = unknown>(body: Record<string, unknown>) => api.post<T>("/api/trip/ask", body);
export const generateItinerary = <T = unknown>(body: Record<string, unknown>) =>
    api.post<T>("/api/trip/generate-itinerary", body);
export const getLocalRoute = <T = unknown>(body: Record<string, unknown>) => api.post<T>("/api/trip/local-route", body);
export const saveTrip = <T = { id: string }>(body: Record<string, unknown>) => api.post<T>("/api/trip/save", body);

// Sharing (published, immutable snapshots)
export const shareTrip = <T = { id: string }>(body: Record<string, unknown>) => api.post<T>("/api/share", body);
export const getSharedTrip = <T = unknown>(id: string) => api.get<T>(`/api/share/${id}`);
export const getPublicCollection = <T = unknown>(folderID: string) =>
    api.get<T>(`/api/share/collection/${folderID}`);
