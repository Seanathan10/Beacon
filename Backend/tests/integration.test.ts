/**
 * End-to-End Tests for Integration
 *
 * Tests that verify cross-feature functionality including:
 * - Full user workflows
 * - Data integrity across operations
 * - Edge cases and error handling
 * - Concurrent operations
 */

import request from 'supertest';
import { createTestApp, createTestUser, createTestPin, createTestPost } from './helpers/testApp';

let app: any;

beforeAll(async () => {
  app = await createTestApp();
});

describe('Integration Tests', () => {
  describe('Complete User Workflow', () => {
    it('should support a complete user journey: register -> create pin -> comment -> like', async () => {
      // Step 1: Register
      const registerResponse = await request(app).post('/api/register').send({
        email: 'journey@example.com',
        password: 'journey123',
        name: 'Journey User',
      });

      expect(registerResponse.status).toBe(201);
      const token = registerResponse.body.accessToken;
      const userId = registerResponse.body.user.id;

      // Step 2: Create a pin
      const pinResponse = await request(app)
        .post('/api/pins')
        .set('Authorization', `Bearer ${token}`)
        .send({
          latitude: 37.7749,
          longitude: -122.4194,
          title: 'My Favorite Spot',
          address: 'San Francisco, CA',
          message: 'Amazing views!',
          tags: ['scenic', 'photography'],
        });

      expect(pinResponse.status).toBe(201);
      const pinId = pinResponse.body.id;

      // Step 3: Comment on the pin
      const commentResponse = await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ comment: 'First comment on my own pin!' });

      expect(commentResponse.status).toBe(201);
      expect(commentResponse.body.accountID).toBe(userId);

      // Step 4: Like the pin
      const likeResponse = await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(likeResponse.status).toBe(204);

      // Step 5: Verify all data
      const getPinResponse = await request(app)
        .get(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getPinResponse.body[0].title).toBe('My Favorite Spot');

      const getCommentsResponse = await request(app)
        .get(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${token}`);

      expect(getCommentsResponse.body.length).toBe(1);

      const getLikesResponse = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(getLikesResponse.body.wasLiked).toBe(true);
    });

    it('should handle multi-user interaction on same pin', async () => {
      // Create owner
      const owner = await createTestUser('owner@example.com', 'password', 'Owner');
      const pinId = createTestPin(owner.userId, { title: 'Popular Spot', likes: 0 });

      // Create multiple other users
      const users = await Promise.all([
        createTestUser('user1@example.com', 'pass', 'User1'),
        createTestUser('user2@example.com', 'pass', 'User2'),
        createTestUser('user3@example.com', 'pass', 'User3'),
      ]);

      // All users comment
      for (const [index, user] of users.entries()) {
        const response = await request(app)
          .post(`/api/pins/${pinId}/comments`)
          .set('Authorization', `Bearer ${user.token}`)
          .send({ comment: `Comment from user ${index + 1}` });

        expect(response.status).toBe(201);
      }

      // All users like
      for (const user of users) {
        const response = await request(app)
          .post(`/api/likes/${pinId}`)
          .set('Authorization', `Bearer ${user.token}`);

        expect(response.status).toBe(204);
      }

      // Verify counts
      const commentsResponse = await request(app)
        .get(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${owner.token}`);

      expect(commentsResponse.body.length).toBe(3);

      const likesResponse = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${owner.token}`);

      expect(likesResponse.body.likes).toBe(3);
    });
  });

  describe('Data Relationships', () => {
    it('should verify pins belong to their creator', async () => {
      // Create fresh user for this test
      const user = await createTestUser('pinowner@example.com', 'password', 'Pin Owner');

      // Create a pin for this user
      const pinId = createTestPin(user.userId, { title: 'My Pin' });

      // Verify pin exists and belongs to user
      const userPinsResponse = await request(app)
        .get('/api/pins/user')
        .set('Authorization', `Bearer ${user.token}`);

      expect(userPinsResponse.body.length).toBeGreaterThanOrEqual(1);
      expect(userPinsResponse.body.some((p: any) => p.id === pinId)).toBe(true);
    });

    it('should allow adding and viewing likes on pins', async () => {
      // Create fresh user for this test
      const user = await createTestUser('liker@example.com', 'password', 'Liker');

      const pinId = createTestPin(user.userId, { title: 'Likeable Pin', likes: 0 });

      // Add like
      const likeResponse = await request(app)
        .post(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(likeResponse.status).toBe(204);

      // Check like count
      const getLikesResponse = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(getLikesResponse.body.likes).toBe(1);
      expect(getLikesResponse.body.wasLiked).toBe(true);
    });
  });

  describe('Error Handling', () => {
    let userToken: string;

    beforeEach(async () => {
      const user = await createTestUser('errortest@example.com', 'password', 'Error Test');
      userToken = user.token;
    });

    it('should return proper error for comment on deleted pin', async () => {
      // Create and delete a pin
      const user = await createTestUser('deleter@example.com', 'pass', 'Deleter');
      const pinId = createTestPin(user.userId, { title: 'Soon Gone' });

      await request(app)
        .delete(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${user.token}`);

      // Try to comment on deleted pin
      const response = await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: 'Comment on ghost' });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Pin not found');
    });

    it('should handle concurrent like attempts gracefully', async () => {
      const user = await createTestUser('concurrent@example.com', 'pass', 'Concurrent');
      const pinId = createTestPin(user.userId, { title: 'Race Condition Pin' });

      // Attempt concurrent likes from same user
      const likePromises = [
        request(app).post(`/api/likes/${pinId}`).set('Authorization', `Bearer ${user.token}`),
        request(app).post(`/api/likes/${pinId}`).set('Authorization', `Bearer ${user.token}`),
      ];

      const results = await Promise.all(likePromises);

      // One should succeed (204), one should fail (409)
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toContain(204);
      expect(statuses).toContain(409);

      // Like count should be exactly 1
      const likesResponse = await request(app)
        .get(`/api/likes/${pinId}`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(likesResponse.body.likes).toBe(1);
    });

    it('should maintain data integrity after failed operations', async () => {
      const user = await createTestUser('integrity@example.com', 'pass', 'Integrity');
      const pinId = createTestPin(user.userId, { title: 'Integrity Test' });

      // Add valid comment
      await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ comment: 'Valid comment' });

      // Try invalid comment (too long)
      await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ comment: 'x'.repeat(300) });

      // Original comment should still be there
      const response = await request(app)
        .get(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(response.body.length).toBe(1);
      expect(response.body[0].comment).toBe('Valid comment');
    });
  });

  describe('Authorization Boundaries', () => {
    it('should prevent cross-user pin modification', async () => {
      const user1 = await createTestUser('user1@test.com', 'pass', 'User1');
      const user2 = await createTestUser('user2@test.com', 'pass', 'User2');

      const pinId = createTestPin(user1.userId, { title: 'User1 Pin' });

      // User2 tries to update
      const updateResponse = await request(app)
        .put(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ title: 'Hacked!' });

      expect(updateResponse.status).toBe(403);

      // User2 tries to delete
      const deleteResponse = await request(app)
        .delete(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${user2.token}`);

      expect(deleteResponse.status).toBe(403);

      // Pin should still exist with original title
      const getResponse = await request(app)
        .get(`/api/pins/${pinId}`)
        .set('Authorization', `Bearer ${user1.token}`);

      expect(getResponse.body[0].title).toBe('User1 Pin');
    });

    it('should prevent cross-user comment modification', async () => {
      const user1 = await createTestUser('commenter1@test.com', 'pass', 'Commenter1');
      const user2 = await createTestUser('commenter2@test.com', 'pass', 'Commenter2');

      const pinId = createTestPin(user1.userId, { title: 'Shared Pin' });

      // User1 creates comment
      const commentResponse = await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${user1.token}`)
        .send({ comment: 'My comment' });

      const commentId = commentResponse.body.id;

      // User2 tries to update
      const updateResponse = await request(app)
        .put(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ comment: 'Hacked comment!' });

      expect(updateResponse.status).toBe(403);

      // User2 tries to delete
      const deleteResponse = await request(app)
        .delete(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${user2.token}`);

      expect(deleteResponse.status).toBe(403);
    });

    it('should prevent cross-user post modification', async () => {
      const user1 = await createTestUser('poster1@test.com', 'pass', 'Poster1');
      const user2 = await createTestUser('poster2@test.com', 'pass', 'Poster2');

      const postId = createTestPost(user1.userId, { title: 'User1 Post' });

      // User2 tries to update
      const updateResponse = await request(app)
        .put(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${user2.token}`)
        .send({ title: 'Hacked!' });

      expect(updateResponse.status).toBe(403);

      // User2 tries to delete
      const deleteResponse = await request(app)
        .delete(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${user2.token}`);

      expect(deleteResponse.status).toBe(403);
    });
  });

  describe('Data Consistency', () => {
    it('should maintain consistent state across rapid updates from different users', async () => {
      const creator = await createTestUser('rapid@test.com', 'pass', 'Rapid');
      const postId = createTestPost(creator.userId, { title: 'Rapid Updates', upvotes: 0 });

      // Create 10 different users and upvote concurrently
      const voters = await Promise.all(
        Array(10).fill(null).map((_, i) =>
          createTestUser(`voter${i}@test.com`, 'pass', `Voter${i}`)
        )
      );

      await Promise.all(
        voters.map(voter =>
          request(app)
            .post(`/api/posts/${postId}/upvote`)
            .set('Authorization', `Bearer ${voter.token}`)
        )
      );

      // All 10 distinct users should have their upvote counted
      const response = await request(app)
        .get(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${creator.token}`);

      expect(response.body.upvotes).toBe(10);
    });

    it('should handle rapid pin creation correctly', async () => {
      const user = await createTestUser('bulkpin@test.com', 'pass', 'Bulk Pin');

      // Create multiple pins rapidly
      const createPromises = Array(5)
        .fill(null)
        .map((_, i) =>
          request(app)
            .post('/api/pins')
            .set('Authorization', `Bearer ${user.token}`)
            .send({
              latitude: 37 + i * 0.01,
              longitude: -122 + i * 0.01,
              title: `Pin ${i}`,
            })
        );

      const results = await Promise.all(createPromises);

      // All should succeed
      results.forEach((result) => {
        expect(result.status).toBe(201);
        expect(result.body).toHaveProperty('id');
      });

      // All IDs should be unique
      const ids = results.map((r) => r.body.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);

      // Verify user has exactly these 5 pins and no others
      const userPinsResponse = await request(app)
        .get('/api/pins/user')
        .set('Authorization', `Bearer ${user.token}`);

      expect(userPinsResponse.body.length).toBe(5);
      const returnedIds = userPinsResponse.body.map((p: any) => p.id).sort();
      const expectedIds = [...ids].sort();
      expect(returnedIds).toEqual(expectedIds);
    });
  });

  describe('Share Integration', () => {
    it('should create itinerary with trip data and retrieve it publicly', async () => {
      // Simulate a trip planning result being shared
      const tripResult = {
        itinerary: {
          days: [
            {
              day: 1,
              activities: [
                { time: '09:00', activity: 'Depart via train', carbonKg: 15 },
                { time: '12:00', activity: 'Arrive at destination' },
                { time: '14:00', activity: 'Check into eco-hotel' },
              ],
            },
          ],
          tips: ['Use public transit', 'Bring reusable bottle'],
          carbonStats: {
            totalKg: 45,
            savings: 30,
          },
        },
        itineraryType: 'Eco-Adventure',
        settings: {
          startLocation: 'New York',
          endLocation: 'Boston',
          transitMode: 'train',
          hotel: 'Green Stay Inn',
        },
      };

      // Create share
      const createResponse = await request(app).post('/api/share').send(tripResult);
      expect(createResponse.status).toBe(201);

      const shareId = createResponse.body.id;

      // Retrieve without auth (public access)
      const getResponse = await request(app).get(`/api/share/${shareId}`);
      expect(getResponse.status).toBe(200);
      expect(getResponse.body.itinerary.carbonStats.totalKg).toBe(45);
      expect(getResponse.body.settings.transitMode).toBe('train');
    });
  });
});
