import { api } from "@/lib/api";

/**
 * Typed wrappers for the pin endpoints. Thin layer over the api client so
 * components import named functions instead of hand-writing /api/pins URLs.
 */

export interface PinInput {
    title?: string | null;
    address?: string | null;
    description?: string | null;
    image?: string | null;
    latitude?: number;
    longitude?: number;
    tags?: string | string[];
}

export const getAllPins = <T = unknown>(queryString = "") => api.get<T>(`/api/pins${queryString}`);
export const getUserPins = <T = unknown>() => api.get<T>("/api/pins/user");
export const getPin = <T = unknown>(id: number | string) => api.get<T>(`/api/pins/${id}`);
export const getSimilarPins = <T = unknown>(id: number | string, opts?: RequestInit) =>
    api.get<T[]>(`/api/pins/${id}/similar`, opts);
export const getNearbyPins = <T = unknown>(body: { latitude: number; longitude: number }) =>
    api.post<T>("/api/pins/nearby", body);
export const createPin = <T = { id: number }>(body: PinInput) => api.post<T>("/api/pins", body as Record<string, unknown>);
export const updatePin = <T = unknown>(id: number | string, body: PinInput) =>
    api.put<T>(`/api/pins/${id}`, body as Record<string, unknown>);
export const deletePin = (id: number | string) => api.delete(`/api/pins/${id}`);
