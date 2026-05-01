/**
 * End-to-End Tests for Trip Planning
 *
 * These tests run against the real Express app + OpenAPI request validation,
 * but mock external network/service dependencies (AI, Google Routes, Amadeus, Hotels).
 */

import request from 'supertest';
import { jest } from '@jest/globals';
import { createTestPin, createTestUser, createTestApp } from './helpers/testApp';

// --- Mock external dependencies BEFORE importing the app (ESM) ---

const mockSearchFlights = jest.fn(async () => [
  {
    price: 123,
    duration: 'PT2H30M',
    carbonEstimateKg: 50,
    stops: 0,
    segments: [
      {
        direction: 'outbound',
        carrier: 'UA',
        flightNumber: 'UA123',
      },
    ],
  },
]);

const mockGetCityAirportCode = jest.fn((city: string) => {
  if (/san francisco/i.test(city)) return 'SFO';
  if (/los angeles/i.test(city)) return 'LAX';
  return null;
});

const mockGetAirportCoordinates = jest.fn((code: string) => {
  if (code === 'SFO') return { lat: 37.6213, lng: -122.379 };
  if (code === 'LAX') return { lat: 33.9416, lng: -118.4085 };
  return { lat: 0, lng: 0 };
});

const mockSearchTransit = jest.fn(async (): Promise<any> => [
  {
    duration: '1h 0m',
    distanceKm: 10,
    polyline: 'transit_poly',
    carbonEstimateKg: 0.5,
    segments: [
      {
        mode: 'RAIL',
        lineName: 'Red Line',
        departureStop: 'A',
        arrivalStop: 'B',
        departureTime: '08:00',
        arrivalTime: '09:00',
        headsign: 'Downtown',
        agency: 'Metro',
        polyline: 'seg_poly',
        departureLocation: { lat: 1, lng: 2 },
        arrivalLocation: { lat: 3, lng: 4 },
      },
    ],
  },
]);

const mockSearchDriving = jest.fn(async (): Promise<any> => ({
  distanceKm: 10,
  duration: '15m',
  carbonEstimateKg: 2,
  polyline: 'driving_poly',
}));

const mockSearchEcoHotels = jest.fn(async (): Promise<any> => [
  {
    name: 'Eco Stay',
    address: '123 Green St',
    pricePerNight: '$199',
    rating: 4.6,
    sustainability: 'Eco-certified',
    bookingUrl: 'https://example.com/hotel',
    imageUrl: 'https://example.com/hotel.jpg',
  },
]);

const mockGenerateItinerary = jest.fn(async (): Promise<any> => ({
  summary: 'Mock itinerary',
  days: [
    {
      day: 1,
      title: 'Day 1',
      activities: [
        {
          time: '09:00',
          name: 'Walk the park',
          description: 'A nice walk',
        },
      ],
    },
  ],
  sustainabilityTips: ['Use transit'],
  carbonOffsetSuggestions: ['Plant trees'],
}));

const mockAnswerTripQuestion = jest.fn(async (): Promise<any> => 'Mock answer');

const jestAny: any = jest;

jestAny.unstable_mockModule('../services/amadeus', () => ({
  searchFlights: mockSearchFlights,
  getCityAirportCode: mockGetCityAirportCode,
  getAirportCoordinates: mockGetAirportCoordinates,
}));

jestAny.unstable_mockModule('../services/googleRoutes', () => ({
  searchTransit: mockSearchTransit,
  searchDriving: mockSearchDriving,
}));

jestAny.unstable_mockModule('../services/hotelService', () => ({
  searchEcoHotels: mockSearchEcoHotels,
}));

jestAny.unstable_mockModule('../services/ai', () => ({
  generateItinerary: mockGenerateItinerary,
  answerTripQuestion: mockAnswerTripQuestion,
}));

let app: any;

function makeGeocodeResponse(lat: number, lng: number) {
  return {
    ok: true,
    json: async () => ({
      results: [
        {
          geometry: {
            location: { lat, lng },
          },
        },
      ],
    }),
  } as any;
}

describe('Trip', () => {
  let authToken: string;

  beforeAll(async () => {
    // Ensure geocoding works even in test.
    process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'test-key';

    // Mock fetch for Google Geocoding calls used by routes/trip.ts
    (globalThis as any).fetch = jest.fn(async (url: string) => {
      const urlStr = String(url);
      if (!urlStr.includes('maps.googleapis.com/maps/api/geocode/json')) {
        return { ok: false, status: 500, json: async () => ({}) } as any;
      }

      if (urlStr.includes('San%20Francisco')) return makeGeocodeResponse(37.7749, -122.4194);
      if (urlStr.includes('Los%20Angeles')) return makeGeocodeResponse(34.0522, -118.2437);

      // Default: still return a location
      return makeGeocodeResponse(0, 0);
    });

    app = await createTestApp();
  });

  // Create a fresh authenticated user before each test so the JWT always
  // references a real account that exists in the current test's DB state.
  beforeEach(async () => {
    const user = await createTestUser('tripuser@example.com', 'password123', 'Trip User');
    authToken = user.token;
  });

  describe('POST /api/trip/plan', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/trip/plan')
        .send({ startLocation: 'San Francisco', endLocation: 'Los Angeles', itineraryType: 'nature' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('No token provided');
    });

    it('should reject invalid request bodies via OpenAPI validation', async () => {
      const response = await request(app)
        .post('/api/trip/plan')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ startLocation: 'San Francisco', endLocation: 'Los Angeles', durationDays: '3' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });

    it('should plan a trip successfully (mocked dependencies)', async () => {
      const response = await request(app)
        .post('/api/trip/plan')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          startLocation: 'San Francisco',
          endLocation: 'Los Angeles',
          itineraryType: 'nature',
          durationDays: 3,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('origin', 'San Francisco');
      expect(response.body).toHaveProperty('destination', 'Los Angeles');
      expect(response.body).toHaveProperty('itineraryType', 'nature');
      expect(Array.isArray(response.body.transitOptions)).toBe(true);
      expect(response.body).toHaveProperty('itinerary');
      expect(response.body.itinerary).toHaveProperty('summary', 'Mock itinerary');

      expect(mockGenerateItinerary).toHaveBeenCalled();
    });

    it('should return 400 when geocoding fails for origin', async () => {
      const originalFetch = (globalThis as any).fetch;

      (globalThis as any).fetch = jest.fn(async (url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('Unknown%20City')) {
          return { ok: true, json: async () => ({ results: [] }) } as any;
        }
        return originalFetch(url);
      });

      const response = await request(app)
        .post('/api/trip/plan')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          startLocation: 'Unknown City',
          endLocation: 'Los Angeles',
          itineraryType: 'nature',
          durationDays: 3,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Could not recognize origin location');

      (globalThis as any).fetch = originalFetch;
    });
  });

  describe('POST /api/trip/plan/stream', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/trip/plan/stream')
        .send({ startLocation: 'San Francisco', endLocation: 'Los Angeles', itineraryType: 'nature' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('No token provided');
    });

    it('should stream SSE updates and end with a ready stage', async () => {
      const response = await request(app)
        .post('/api/trip/plan/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ startLocation: 'San Francisco', endLocation: 'Los Angeles', itineraryType: 'nature' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/event-stream/i);
      expect(typeof response.text).toBe('string');
      expect(response.text).toContain('data:');
      expect(response.text).toContain('"stage":"ready"');
    });

    it('should return 400 when required fields are missing (validated by OpenAPI middleware)', async () => {
      // The SSE endpoint now runs after the OpenAPI validator, so missing required
      // fields (itineraryType is required) are rejected at the middleware level with
      // a 400 rather than reaching the handler and emitting an SSE error stage.
      const response = await request(app)
        .post('/api/trip/plan/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ startLocation: 'San Francisco', endLocation: 'Los Angeles' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });

    it('should emit an error stage when geocoding fails', async () => {
      const originalFetch = (globalThis as any).fetch;

      (globalThis as any).fetch = jest.fn(async (url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('Unknown%20City')) {
          return { ok: true, json: async () => ({ results: [] }) } as any;
        }
        return originalFetch(url);
      });

      const response = await request(app)
        .post('/api/trip/plan/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ startLocation: 'Unknown City', endLocation: 'Los Angeles', itineraryType: 'nature' });

      expect(response.status).toBe(200);
      expect(response.text).toContain('"stage":"error"');
      expect(response.text).toContain('Could not recognize origin location');

      (globalThis as any).fetch = originalFetch;
    });
  });

  describe('POST /api/trip/ask', () => {
    it('should require authentication', async () => {
      const response = await request(app).post('/api/trip/ask').send({ question: 'Hello?' });
      expect(response.status).toBe(401);
    });

    it('should require a question', async () => {
      const response = await request(app)
        .post('/api/trip/ask')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      // OpenAPI validation should catch this
      expect(response.status).toBe(400);
    });

    it('should answer the question (mocked AI)', async () => {
      const response = await request(app)
        .post('/api/trip/ask')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          question: 'What should I pack?',
          origin: 'San Francisco',
          destination: 'Los Angeles',
          itineraryType: 'nature',
        });

      expect(response.status).toBe(200);
      expect(response.body.answer).toBe('Mock answer');
      expect(mockAnswerTripQuestion).toHaveBeenCalled();
    });
  });

  describe('POST /api/trip/generate-itinerary', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/trip/generate-itinerary')
        .send({ destination: 'Los Angeles', itineraryType: 'nature', selectedTransit: { mode: 'train', duration: '1h', carbonKg: 1, carbonRating: { rating: 'A', color: '#0f0', score: 90 } } });

      expect(response.status).toBe(401);
    });

    it('should reject missing required fields via OpenAPI validation', async () => {
      const response = await request(app)
        .post('/api/trip/generate-itinerary')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ destination: 'Los Angeles', itineraryType: 'nature' });

      expect(response.status).toBe(400);
    });

    it('should generate itinerary with selections', async () => {
      const response = await request(app)
        .post('/api/trip/generate-itinerary')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          destination: 'Los Angeles',
          itineraryType: 'nature',
          durationDays: 3,
          selectedTransit: {
            mode: 'train',
            duration: '1h 0m',
            carbonKg: 1,
            carbonRating: { rating: 'A', color: '#0f0', score: 90 },
          },
          selectedHotel: {
            name: 'Eco Stay',
            address: '123 Green St',
            pricePerNight: '$199',
            rating: 4.6,
            sustainability: 'Eco-certified',
          },
          localPins: [],
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('itinerary');
      expect(response.body.itinerary.summary).toBe('Mock itinerary');
      expect(response.body).toHaveProperty('selectedTransit');
    });
  });

  describe('POST /api/trip/local-route', () => {
    it('should require authentication', async () => {
      const response = await request(app).post('/api/trip/local-route').send({ originLat: 1, originLng: 2, destLat: 3, destLng: 4 });
      expect(response.status).toBe(401);
    });

    it('should reject invalid bodies via OpenAPI validation', async () => {
      const response = await request(app)
        .post('/api/trip/local-route')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return a transit route when available', async () => {
      const response = await request(app)
        .post('/api/trip/local-route')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ originLat: 37.6213, originLng: -122.379, destLat: 37.7749, destLng: -122.4194 });

      expect(response.status).toBe(200);
      expect(response.body.mode).toBe('transit');
      expect(response.body).toHaveProperty('segments');
      expect(Array.isArray(response.body.segments)).toBe(true);
    });

    it('should accept address-based inputs', async () => {
      const response = await request(app)
        .post('/api/trip/local-route')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ originAddress: 'SFO Airport', destAddress: 'Downtown San Francisco' });

      expect(response.status).toBe(200);
      expect(['transit', 'driving']).toContain(response.body.mode);
    });

    it('should return 404 when no route is found', async () => {
      mockSearchTransit.mockResolvedValueOnce([]);
      mockSearchDriving.mockResolvedValueOnce({
        distanceKm: 10,
        duration: '15m',
        carbonEstimateKg: 2,
        polyline: undefined,
      });

      const response = await request(app)
        .post('/api/trip/local-route')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ originLat: 37.6213, originLng: -122.379, destLat: 37.7749, destLng: -122.4194 });

      expect(response.status).toBe(404);
    });

    it('should fall back to driving when transit is unavailable', async () => {
      mockSearchTransit.mockResolvedValueOnce([]);
      mockSearchDriving.mockResolvedValueOnce({
        distanceKm: 10,
        duration: '15m',
        carbonEstimateKg: 2,
        polyline: 'drive_poly',
      });

      const response = await request(app)
        .post('/api/trip/local-route')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ originLat: 37.6213, originLng: -122.379, destLat: 37.7749, destLng: -122.4194 });

      expect(response.status).toBe(200);
      expect(response.body.mode).toBe('driving');
      expect(response.body.polyline).toBe('drive_poly');
    });

    it('should accept 0-valued coordinate inputs', async () => {
      const response = await request(app)
        .post('/api/trip/local-route')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ originLat: 0, originLng: 0, destLat: 0, destLng: 0 });

      // With our mocks, transit is available, so this should succeed.
      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/trip/nearby-pins', () => {
    it('should require authentication', async () => {
      const response = await request(app).post('/api/trip/nearby-pins').send({ lat: 1, lng: 2 });
      expect(response.status).toBe(401);
    });

    it('should reject invalid bodies via OpenAPI validation', async () => {
      const response = await request(app)
        .post('/api/trip/nearby-pins')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ lat: 1 });

      expect(response.status).toBe(400);
    });

    it('should return pins array', async () => {
      const response = await request(app)
        .post('/api/trip/nearby-pins')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ lat: 37.7749, lng: -122.4194, radiusKm: 50 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('pins');
      expect(Array.isArray(response.body.pins)).toBe(true);
    });

    it('should accept 0-valued coordinates', async () => {
      const response = await request(app)
        .post('/api/trip/nearby-pins')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ lat: 0, lng: 0, radiusKm: 50 });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.pins)).toBe(true);
    });

    it('should prioritize the requesting user pins', async () => {
      const owner = await createTestUser('nearby-owner@example.com', 'pass', 'Owner');
      const other = await createTestUser('nearby-other@example.com', 'pass', 'Other');

      createTestPin(other.userId, { title: 'Other Pin', latitude: 37.7749, longitude: -122.4194 });
      createTestPin(owner.userId, { title: 'Owner Pin', latitude: 37.7749, longitude: -122.4194 });

      const response = await request(app)
        .post('/api/trip/nearby-pins')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ lat: 37.7749, lng: -122.4194, radiusKm: 50 });

      expect(response.status).toBe(200);
      expect(response.body.pins.length).toBeGreaterThanOrEqual(2);
      expect(response.body.pins[0].isUserPin).toBe(true);
      const hasOther = response.body.pins.some((p: any) => p.isUserPin === false);
      expect(hasOther).toBe(true);
    });
  });
});
