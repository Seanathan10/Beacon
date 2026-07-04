import type { TripPlanResult } from "@/components/TripPlanner";

/** The stored itinerary blob: a partial TripPlanResult under `settings`. */
export type StoredTrip = {
    itinerary: TripPlanResult["itinerary"];
    itineraryType?: string;
    isPublic?: boolean;
    settings?: Partial<TripPlanResult>;
};

/** Flatten a stored trip blob into a full TripPlanResult (settings hoisted, defaults applied). */
export function toTripPlanResult(data: StoredTrip): TripPlanResult {
    return {
        itinerary: data.itinerary,
        itineraryType: data.itineraryType || "Adventure",
        origin: data.settings?.origin || "Unknown",
        destination: data.settings?.destination || "Unknown",
        durationDays: data.settings?.durationDays || 7,
        transitOptions: data.settings?.transitOptions || [],
        ecoHotels: data.settings?.ecoHotels || [],
        localPins: data.settings?.localPins || [],
        carbonStats: data.settings?.carbonStats || {
            bestOption: { mode: "unknown", carbonKg: 0 },
            worstOption: { mode: "unknown", carbonKg: 0 },
            typicalTouristKg: 0,
            savingsVsTypical: 0,
            offsetCostUsd: 0,
        },
        originCoords: data.settings?.originCoords,
        destCoords: data.settings?.destCoords,
        routePolylines: data.settings?.routePolylines || [],
    };
}
