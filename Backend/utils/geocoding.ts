import { fetchWithTimeout } from "./fetchWithTimeout";

export async function geocodeLocation(location: string): Promise<{ latitude: number; longitude: number } | null> {
    if (!location || location.trim().length === 0) {
        return null;
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    // Try Google Maps first if API key available
    if (apiKey) {
        try {
            const response = await fetchWithTimeout(
                `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`
            );
            if (response.ok) {
                const data = await response.json();
                const geometry = data.results?.[0]?.geometry;
                if (geometry?.location) {
                    return {
                        latitude: geometry.location.lat,
                        longitude: geometry.location.lng
                    };
                }
            }
        } catch {
            // Fall through to Nominatim
        }
    }

    // Fallback: Nominatim (OpenStreetMap) — no key required
    try {
        const response = await fetchWithTimeout(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
            { headers: { "User-Agent": "BeaconApp/1.0" } }
        );
        if (!response.ok) return null;
        const data = await response.json();
        if (data?.[0]) {
            return {
                latitude: parseFloat(data[0].lat),
                longitude: parseFloat(data[0].lon)
            };
        }
    } catch {
        // Ignore errors, return null
    }

    return null;
}
