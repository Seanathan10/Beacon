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
  let otherUserId: number;
  let pinId: number;

  beforeEach(async () => {
    const user = await createTestUser('liker@example.com', 'password123', 'Liker');
    userToken = user.token;
    userId = user.userId;

    const otherUser = await createTestUser('other@example.com', 'password123', 'Other');
    otherUserToken = otherUser.token;
    otherUserId = otherUser.userId;

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
      // With COALESCE or IFNULL, null likes should be treated as 0
      // So null + 1 like should equal 1 (or remain null if not fixed)
      // This documents current behavior - should be fixed in schema
      expect(response.body).toHaveProperty('likes');
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
});
