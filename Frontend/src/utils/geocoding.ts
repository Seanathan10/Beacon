/**
 * Reverse geocoding utility using Nominatim (OpenStreetMap)
 * API Docs: https://nominatim.org/release-docs/latest/api/Reverse/
 */

interface NominatimResponse {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address: {
    amenity?: string;
    shop?: string;
    building?: string;
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    [key: string]: string | undefined;
  };
  boundingbox: string[];
}

export interface ReverseGeocodeResult {
  name: string;
  fullAddress: string;
  details: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

/**
 * Performs reverse geocoding to get a location name from coordinates
 * Uses Nominatim OpenStreetMap API (free, no API key required)
 * 
 * @param lat - Latitude coordinate
 * @param lon - Longitude coordinate
 * @returns Location information including name and address
 */
export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', lat.toString());
  url.searchParams.set('lon', lon.toString());
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '18'); // Maximum detail level (building level)

  const response = await fetch(url.toString(), {
    headers: {
      // Nominatim requires a valid User-Agent header
      'User-Agent': 'Beacon App (https://github.com/beacon-app)',
    },
  });

  if (!response.ok) {
    throw new Error(`Reverse geocoding failed: ${response.statusText}`);
  }

  const data: NominatimResponse = await response.json();

  // Extract the most specific name available
  // Priority: amenity/shop name > building > street address
  const address = data.address || {};
  const specificName = 
    address.amenity || 
    address.shop || 
    address.building ||
    data.name;

  // Build a friendly display name
  let displayName: string;
  
  if (specificName) {
    // If we have a specific place name (like "Poke House"), use it
    displayName = specificName;
  } else if (address.house_number && address.road) {
    // Fall back to street address
    displayName = `${address.house_number} ${address.road}`;
  } else if (address.road) {
    // Just the road name
    displayName = address.road;
  } else if (address.neighbourhood || address.suburb) {
    // Neighbourhood or suburb
    displayName = address.neighbourhood || address.suburb || 'Unknown Location';
  } else {
    // Last resort: use city or display_name
    displayName = address.city || data.display_name?.split(',')[0] || 'Unknown Location';
  }

  return {
    name: displayName,
    fullAddress: data.display_name || '',
    details: {
      street: address.road,
      city: address.city,
      state: address.state,
      country: address.country,
    },
  };
}
