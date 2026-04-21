/**
 * End-to-End Tests for Itinerary Sharing
 *
 * Tests for shared itinerary functionality including:
 * - Creating shareable itineraries
 * - Retrieving shared itineraries
 * - Public access (no auth required)
 * - UUID generation and validation
 */

import request from 'supertest';
import { createTestApp, createTestUser } from './helpers/testApp';

let app: any;

beforeAll(async () => {
  app = await createTestApp();
});

describe('Shared Itineraries', () => {
  describe('POST /api/share', () => {
    it('should create a shareable itinerary', async () => {
      const itineraryData = {
        itinerary: {
          days: [
            {
              day: 1,
              activities: [
                {
                  time: '09:00',
                  activity: 'Visit Golden Gate Bridge',
                  description: 'Start the day with iconic views',
                },
                {
                  time: '12:00',
                  activity: 'Lunch at Fishermans Wharf',
                  description: 'Fresh seafood',
                },
              ],
            },
          ],
          tips: ['Bring layers', 'Book restaurants ahead'],
        },
        itineraryType: 'Adventure',
        settings: {
          durationDays: 3,
          startLocation: 'Los Angeles',
          endLocation: 'San Francisco',
        },
      };

      const response = await request(app).post('/api/share').send(itineraryData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      // UUID format validation
      expect(response.body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should accept itinerary without settings', async () => {
      const response = await request(app).post('/api/share').send({
        itinerary: { days: [], tips: [] },
        itineraryType: 'Relaxation',
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });

    it('should accept itinerary without itineraryType', async () => {
      const response = await request(app).post('/api/share').send({
        itinerary: { days: [], tips: [] },
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });

    it('should reject request without itinerary', async () => {
      const response = await request(app).post('/api/share').send({
        itineraryType: 'Adventure',
        settings: {},
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("must have required property 'itinerary'");
    });

    it('should not require authentication', async () => {
      // No Authorization header
      const response = await request(app).post('/api/share').send({
        itinerary: { days: [] },
      });

      expect(response.status).toBe(201);
    });

    it('should reject payloads larger than 512 KB', async () => {
      // Build JSON whose serialized size exceeds 512 KB.
      // express.json() has a 100 KB default limit, so a request that large is
      // rejected at the middleware level with 413 before our handler runs.
      // Either rejection is acceptable — the important thing is that the server
      // never stores an oversized itinerary.
      const bigString = 'x'.repeat(600 * 1024);

      const response = await request(app).post('/api/share').send({
        itinerary: { blob: bigString },
      });

      expect(response.status).toBe(413);
    });

    it('should generate unique IDs for each itinerary', async () => {
      const ids: string[] = [];

      for (let i = 0; i < 5; i++) {
        const response = await request(app).post('/api/share').send({
          itinerary: { days: [], iteration: i },
        });

        ids.push(response.body.id);
      }

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('GET /api/share/:id', () => {
    let savedId: string;
    const testItinerary = {
      itinerary: {
        days: [
          {
            day: 1,
            activities: [{ time: '10:00', activity: 'Test activity' }],
          },
        ],
        tips: ['Test tip'],
      },
      itineraryType: 'Cultural',
      settings: {
        startLocation: 'NYC',
        endLocation: 'Boston',
        durationDays: 2,
      },
    };

    beforeEach(async () => {
      const response = await request(app).post('/api/share').send(testItinerary);
      savedId = response.body.id;
    });

    it('should retrieve a saved itinerary', async () => {
      const response = await request(app).get(`/api/share/${savedId}`);

      expect(response.status).toBe(200);
      expect(response.body.itinerary).toEqual(testItinerary.itinerary);
      expect(response.body.itineraryType).toBe('Cultural');
      expect(response.body.settings).toEqual(testItinerary.settings);
    });

    it('should include createdAt timestamp', async () => {
      const response = await request(app).get(`/api/share/${savedId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('createdAt');
      // Should be valid ISO date string
      expect(new Date(response.body.createdAt).toISOString()).toBe(response.body.createdAt);
    });

    it('should not require authentication', async () => {
      // No Authorization header
      const response = await request(app).get(`/api/share/${savedId}`);

      expect(response.status).toBe(200);
    });

    it('should return 404 for non-existent itinerary', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';

      const response = await request(app).get(`/api/share/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Itinerary not found');
    });

    it('should return 404 for invalid UUID format', async () => {
      const response = await request(app).get('/api/share/invalid-id');

      // Either 404 or the DB handles it
      expect(response.status).toBe(404);
    });
  });

  describe('Itinerary Data Preservation', () => {
    it('should preserve complex nested itinerary structure', async () => {
      const complexItinerary = {
        itinerary: {
          days: [
            {
              day: 1,
              title: 'Arrival Day',
              activities: [
                {
                  time: '14:00',
                  activity: 'Check into hotel',
                  description: 'Eco-friendly boutique hotel',
                  location: {
                    lat: 37.7749,
                    lng: -122.4194,
                    address: '123 Green St',
                  },
                  carbonFootprint: 0,
                },
                {
                  time: '16:00',
                  activity: 'Walk to local cafe',
                  description: 'Farm-to-table coffee shop',
                  tags: ['coffee', 'local', 'sustainable'],
                },
              ],
            },
            {
              day: 2,
              title: 'Exploration Day',
              activities: [
                {
                  time: '09:00',
                  activity: 'Bike tour',
                  duration: '3 hours',
                  cost: 45,
                },
              ],
            },
          ],
          tips: ['Bring reusable water bottle', 'Use public transit', 'Support local businesses'],
          carbonStats: {
            totalCarbonKg: 150,
            savingsPercent: 35,
          },
        },
        itineraryType: 'Eco-Adventure',
        settings: {
          durationDays: 2,
          startLocation: 'Portland',
          endLocation: 'Seattle',
          preferences: {
            sustainable: true,
            localFood: true,
            maxBudget: 500,
          },
        },
      };

      const createResponse = await request(app).post('/api/share').send(complexItinerary);
      const id = createResponse.body.id;

      const getResponse = await request(app).get(`/api/share/${id}`);

      expect(getResponse.body.itinerary).toEqual(complexItinerary.itinerary);
      expect(getResponse.body.settings).toEqual(complexItinerary.settings);
    });

    it('should preserve array data in itinerary', async () => {
      const itineraryWithArrays = {
        itinerary: {
          days: [1, 2, 3].map((day) => ({
            day,
            activities: ['morning', 'afternoon', 'evening'].map((time) => ({
              time,
              activity: `Activity for ${time}`,
            })),
          })),
          tips: Array(10)
            .fill(null)
            .map((_, i) => `Tip ${i + 1}`),
        },
      };

      const createResponse = await request(app).post('/api/share').send(itineraryWithArrays);
      const getResponse = await request(app).get(`/api/share/${createResponse.body.id}`);

      expect(getResponse.body.itinerary.days.length).toBe(3);
      expect(getResponse.body.itinerary.tips.length).toBe(10);
    });

    it('should handle empty itinerary', async () => {
      const emptyItinerary = {
        itinerary: {},
      };

      const createResponse = await request(app).post('/api/share').send(emptyItinerary);
      const getResponse = await request(app).get(`/api/share/${createResponse.body.id}`);

      expect(getResponse.body.itinerary).toEqual({});
    });

    it('should handle special characters in itinerary', async () => {
      const specialCharsItinerary = {
        itinerary: {
          days: [
            {
              day: 1,
              activities: [
                {
                  activity: 'Visit Café "La Maison"',
                  description: "It's a great place! <script>alert('xss')</script>",
                  notes: 'Unicode: 日本語 🎉 émoji',
                },
              ],
            },
          ],
        },
      };

      const createResponse = await request(app).post('/api/share').send(specialCharsItinerary);
      const getResponse = await request(app).get(`/api/share/${createResponse.body.id}`);

      expect(getResponse.body.itinerary.days[0].activities[0].activity).toBe(
        'Visit Café "La Maison"'
      );
      expect(getResponse.body.itinerary.days[0].activities[0].notes).toBe('Unicode: 日本語 🎉 émoji');
    });
  });

  describe('Public Access', () => {
    it('should allow anyone to view a shared itinerary', async () => {
      // Create itinerary
      const createResponse = await request(app).post('/api/share').send({
        itinerary: { days: [], tips: ['Public tip'] },
        itineraryType: 'Public Trip',
      });

      const id = createResponse.body.id;

      // Multiple "users" should be able to view it
      const response1 = await request(app).get(`/api/share/${id}`);
      const response2 = await request(app).get(`/api/share/${id}`);
      const response3 = await request(app).get(`/api/share/${id}`);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response3.status).toBe(200);

      // All should return same data
      expect(response1.body.itineraryType).toBe('Public Trip');
      expect(response2.body.itineraryType).toBe('Public Trip');
      expect(response3.body.itineraryType).toBe('Public Trip');
    });

    it('should not modify itinerary on read', async () => {
      const original = {
        itinerary: { days: [{ day: 1 }] },
        itineraryType: 'Test',
      };

      const createResponse = await request(app).post('/api/share').send(original);
      const id = createResponse.body.id;

      // Read multiple times
      await request(app).get(`/api/share/${id}`);
      await request(app).get(`/api/share/${id}`);

      // Final read should match original
      const finalResponse = await request(app).get(`/api/share/${id}`);
      expect(finalResponse.body.itinerary).toEqual(original.itinerary);
    });
  });

  describe('Timestamp Handling', () => {
    it('should return ISO 8601 formatted createdAt', async () => {
      const createResponse = await request(app).post('/api/share').send({
        itinerary: { days: [] },
      });

      const getResponse = await request(app).get(`/api/share/${createResponse.body.id}`);

      const createdAt = getResponse.body.createdAt;

      // Should be valid ISO date
      expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);

      // Should be parseable
      const date = new Date(createdAt);
      expect(date.toString()).not.toBe('Invalid Date');

      // Should be recent (within last minute)
      const now = Date.now();
      const created = date.getTime();
      expect(now - created).toBeLessThan(60000);
    });
  });

  describe('Public Collections', () => {
    let testPin: any;
    let testFolderId: string;

    beforeAll(async () => {
      const user = await createTestUser('collectiontest@example.com', 'pass', 'CollectionTest');

      // Create a pin
      const pinRes = await request(app)
        .post('/api/pins')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          title: 'Collection Test Pin',
          latitude: 37.7749,
          longitude: -122.4194,
          address: 'San Francisco, CA',
          description: 'Test pin for collection',
          tags: ['test'],
        });
      testPin = pinRes.body;

      // Create a public folder
      const folderRes = await request(app)
        .post('/api/bookmarks/folders')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: 'Public Collection', isPublic: true });
      testFolderId = folderRes.body.id;

      // Bookmark the pin to the folder
      await request(app)
        .post('/api/bookmarks')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ pinID: testPin.id, folderID: testFolderId });
    });

    it('should return public collection without auth', async () => {
      const res = await request(app).get(`/api/share/collection/${testFolderId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('folder');
      expect(res.body).toHaveProperty('pins');
      expect(res.body.folder.name).toBe('Public Collection');
      expect(Array.isArray(res.body.pins)).toBe(true);
      expect(res.body.pins.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent collection', async () => {
      const res = await request(app).get(
        '/api/share/collection/00000000-0000-0000-0000-000000000000'
      );

      expect(res.status).toBe(404);
    });

    it('should return 403 for private collection', async () => {
      const user = await createTestUser('privatecol@example.com', 'pass', 'PrivateCol');

      const privateFolder = await request(app)
        .post('/api/bookmarks/folders')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: 'Private Collection', isPublic: false });

      const res = await request(app).get(
        `/api/share/collection/${privateFolder.body.id}`
      );

      expect(res.status).toBe(403);
    });

    it('should include folder metadata in response', async () => {
      const res = await request(app).get(`/api/share/collection/${testFolderId}`);

      expect(res.body.folder).toHaveProperty('id');
      expect(res.body.folder).toHaveProperty('name');
      expect(res.body.folder).toHaveProperty('createdAt');
      expect(res.body.folder).toHaveProperty('pinCount');
    });
  });
});
