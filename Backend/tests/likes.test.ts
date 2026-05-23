/**
 * Tests Likes
 *
 * Tests for the like system including:
 * - Adding likes to pins
 * - Removing likes from pins
 * - Getting like counts
 * - Checking if user has liked a pin
 * - Preventing duplicate likes
 */

import request from 'supertest';
import { createTestApp, createTestUser, createTestPin } from './helpers/testApp';
import { getTestDb } from './setup';

let app: any;

beforeAll(async () => {
  app = await createTestApp();
});

describe('Likes', () => {
  let userToken: string;
  let userId: number;
  let otherUserToken: string;
  let pinId: number;

  beforeEach(async () => {
    const user = await createTestUser('liker@example.com', 'password123', 'Liker');
    userToken = user.token;
    userId = user.userId;

    const otherUser = await createTestUser('other@example.com', 'password123', 'Other');
    otherUserToken = otherUser.token;

    pinId = createTestPin(userId, { title: 'Likeable Pin' });
  });

  describe('GET /api/likes/:id', () => {
    it('should return like count and wasLiked status (not liked)', async () => {
      const response = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        likes: 0,
        wasLiked: false,
      });
    });

    it('should return wasLiked true after user likes', async () => {
      // Add like
      await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      const response = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.body.wasLiked).toBe(true);
      expect(response.body.likes).toBe(1);
    });

    it('should return 404 for non-existent pin', async () => {
      const response = await request(app)
        .get('/api/likes/99999')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/likes/${pinId}`);
      expect(response.status).toBe(401);
    });

    it('should show correct wasLiked for different users', async () => {
      // User 1 likes
      await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // User 1 sees wasLiked: true
      const response1 = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(response1.body.wasLiked).toBe(true);

      // User 2 sees wasLiked: false (hasn't liked)
      const response2 = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      expect(response2.body.wasLiked).toBe(false);
    });
  });

  describe('POST /api/likes/:id', () => {
    it('should add a like to a pin', async () => {
      const response = await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(204);

      // Verify like was added
      const likesResponse = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(likesResponse.body.wasLiked).toBe(true);
      expect(likesResponse.body.likes).toBe(1);
    });

    it('should allow multiple users to like the same pin', async () => {
      // User 1 likes
      await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // User 2 likes
      await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      // Check count
      const response = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.body.likes).toBe(2);
    });

    it('should reject duplicate likes from same user', async () => {
      // First like
      await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Second like attempt
      const response = await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Already liked');
    });

    it('should return 404 for non-existent pin', async () => {
      const response = await request(app)
        .post('/api/likes/99999')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const response = await request(app).post(`/api/likes/${pinId}`);
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/likes/:id', () => {
    beforeEach(async () => {
      // Add a like first
      await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);
    });

    it('should remove a like from a pin', async () => {
      const response = await request(app)
        .delete(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(204);

      // Verify like was removed
      const likesResponse = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(likesResponse.body.wasLiked).toBe(false);
      expect(likesResponse.body.likes).toBe(0);
    });

    it('should return 404 when trying to remove non-existent like', async () => {
      const response = await request(app)
        .delete(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${otherUserToken}`); // Other user hasn't liked

      expect(response.status).toBe(404);
    });

    it('should only remove the requesting users like', async () => {
      // Other user also likes
      await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      // User 1 removes their like
      await request(app)
        .delete(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Other user should still have their like
      const response = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(response.body.wasLiked).toBe(true);
      expect(response.body.likes).toBe(1);
    });

    it('should require authentication', async () => {
      const response = await request(app).delete(`/api/likes/${pinId}`);
      expect(response.status).toBe(401);
    });
  });

  describe('Like Count Calculations', () => {
    it('should correctly count likes from the likes table', async () => {
      // Add 3 likes from different users
      const user2 = await createTestUser('u2@example.com', 'pass', 'U2');
      const user3 = await createTestUser('u3@example.com', 'pass', 'U3');

      await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);
      await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${user2.token}`);
      await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${user3.token}`);

      const response = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.body.likes).toBe(3);
    });

    it('should handle pins with zero base likes', async () => {
      const zeroLikesPin = createTestPin(userId, { title: 'Zero Likes', likes: 0 });

      const response = await request(app)
        .get(`/api/likes/${zeroLikesPin}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.body.likes).toBe(0);

      // Add a like
      await request(app)
        .post(`/api/likes/${zeroLikesPin}`)
        .set('Authorization', `Bearer ${userToken}`);

      const afterLike = await request(app)
        .get(`/api/likes/${zeroLikesPin}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(afterLike.body.likes).toBe(1);
    });

    it('should handle pins with null base likes by treating as zero', async () => {
      // Create pin with null likes (edge case)
      const db = getTestDb();
      db.exec(`
        INSERT INTO pin (creatorID, latitude, longitude, title, likes)
        VALUES (${userId}, 0, 0, 'Null Likes Pin', NULL)
      `);
      const [{ id: nullLikesPinId }] = db.prepare('SELECT last_insert_rowid() as id').all() as any[];

      // Add a like from likes table
      await request(app)
        .post(`/api/likes/${nullLikesPinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      const response = await request(app)
        .get(`/api/likes/${nullLikesPinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      // getLikes counts from the likes junction table, so a NULL pin.likes column is irrelevant
      expect(response.body.likes).toBe(1);
      expect(response.body.wasLiked).toBe(true);
    });
  });

  describe('Like/Unlike Toggle Behavior', () => {
    it('should toggle like status correctly', async () => {
      // Initial state: not liked
      let response = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(response.body.wasLiked).toBe(false);

      // Like
      await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      response = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(response.body.wasLiked).toBe(true);

      // Unlike
      await request(app)
        .delete(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      response = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(response.body.wasLiked).toBe(false);

      // Like again
      await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);

      response = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(response.body.wasLiked).toBe(true);
    });
  });

  describe('GET /api/likes/user', () => {
    let user1Token: string;
    let user2Token: string;
    let pin1: number;
    let pin2: number;

    beforeEach(async () => {
      const user1 = await createTestUser('liker1@example.com', 'pass', 'Liker1');
      const user2 = await createTestUser('creator@example.com', 'pass', 'Creator');

      user1Token = user1.token;
      user2Token = user2.token;

      // User2 creates pins
      const pinRes1 = await request(app)
        .post('/api/pins')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          title: 'Pin 1',
          latitude: 37.7749,
          longitude: -122.4194,
          address: 'SF',
          description: 'First pin',
        });
      pin1 = pinRes1.body.id;

      const pinRes2 = await request(app)
        .post('/api/pins')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          title: 'Pin 2',
          latitude: 34.0522,
          longitude: -118.2437,
          address: 'LA',
          description: 'Second pin',
        });
      pin2 = pinRes2.body.id;

      // User1 likes both pins
      await request(app)
        .post(`/api/likes/${pin1}`)
        .set('Authorization', `Bearer ${user1Token}`);
      await request(app)
        .post(`/api/likes/${pin2}`)
        .set('Authorization', `Bearer ${user1Token}`);
    });

    it('should return all liked pins for authenticated user', async () => {
      const response = await request(app)
        .get('/api/likes/user')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);

      // Should contain the pins we liked
      const pinIds = response.body.map((p: any) => p.id);
      expect(pinIds).toContain(pin1);
      expect(pinIds).toContain(pin2);
    });

    it('should include pin details in response', async () => {
      const response = await request(app)
        .get('/api/likes/user')
        .set('Authorization', `Bearer ${user1Token}`);

      const pin = response.body.find((p: any) => p.id === pin1);
      expect(pin).toBeDefined();
      expect(pin).toHaveProperty('title');
      expect(pin).toHaveProperty('latitude');
      expect(pin).toHaveProperty('longitude');
      expect(pin).toHaveProperty('address');
      expect(pin).toHaveProperty('description');
      expect(pin).toHaveProperty('likes');
      expect(pin).toHaveProperty('createdAt');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/likes/user');

      expect(response.status).toBe(401);
    });

    it('should return empty array if user has not liked anything', async () => {
      const newUser = await createTestUser('noLikes@example.com', 'pass', 'NoLikes');

      const response = await request(app)
        .get('/api/likes/user')
        .set('Authorization', `Bearer ${newUser.token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it('should only return pins liked by authenticated user', async () => {
      // Different user
      const otherUser = await createTestUser('other-likes@example.com', 'pass', 'Other');

      // Other user likes pin1
      await request(app)
        .post(`/api/likes/${pin1}`)
        .set('Authorization', `Bearer ${otherUser.token}`);

      // User1's likes should still be only pin1 and pin2
      const response = await request(app)
        .get('/api/likes/user')
        .set('Authorization', `Bearer ${user1Token}`);

      const pinIds = response.body.map((p: any) => p.id);
      expect(pinIds).toContain(pin1);
      expect(pinIds).toContain(pin2);
      expect(pinIds.length).toBe(2); // Should not include other users' pins
    });

    it('should maintain consistency when likes are removed', async () => {
      // Remove a like
      await request(app)
        .delete(`/api/likes/${pin1}`)
        .set('Authorization', `Bearer ${user1Token}`);

      const response = await request(app)
        .get('/api/likes/user')
        .set('Authorization', `Bearer ${user1Token}`);

      const pinIds = response.body.map((p: any) => p.id);
      expect(pinIds).not.toContain(pin1);
      expect(pinIds).toContain(pin2);
    });
  });
});
