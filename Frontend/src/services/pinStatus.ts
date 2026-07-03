import { api } from "@/lib/api";

/** Typed wrappers for a user's visited/wishlist status on a pin. */

export type PinStatus = "visited" | "wishlist";

export const getUserPinStatuses = <T = unknown>() => api.get<T>("/api/pin-status");

export const setPinStatus = (pinId: number | string, status: PinStatus) =>
    api.put(`/api/pins/${pinId}/status`, { status });

export const deletePinStatus = (pinId: number | string) =>
    api.delete(`/api/pins/${pinId}/status`);
