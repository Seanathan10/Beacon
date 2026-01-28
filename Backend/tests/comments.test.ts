/**
 * End-to-End Tests for Comments
 *
 * Tests for comment functionality including:
 * - Creating comments on pins
 * - Reading comments
 * - Updating comments
 * - Deleting comments
 * - Validation (character limits)
 * - Authorization checks
 */

import request from 'supertest';
import { createTestApp, createTestUser, createTestPin, createTestComment } from './helpers/testApp';

const app = createTestApp();

describe('Comments', () => {
  let userToken: string;
  let userId: number;
  let otherUserToken: string;
  let otherUserId: number;
  let pinId: number;

  beforeEach(async () => {
    const user = await createTestUser('commenter@example.com', 'password123', 'Commenter');
    userToken = user.token;
    userId = user.userId;

    const otherUser = await createTestUser('other@example.com', 'password123', 'Other');
    otherUserToken = otherUser.token;
    otherUserId = otherUser.userId;

    pinId = createTestPin(userId, { title: 'Pin for Comments' });
  });

  describe('POST /api/pins/:pinId/comments', () => {
    it('should create a comment on a pin', async () => {
      const response = await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: 'Great place to visit!' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: expect.any(Number),
        pinID: pinId,
        accountID: userId,
        comment: 'Great place to visit!',
        email: 'commenter@example.com',
      });
      expect(response.body).toHaveProperty('createdAt');
    });

    it('should trim whitespace from comments', async () => {
      const response = await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: '  Trimmed comment  ' });

      expect(response.status).toBe(201);
      expect(response.body.comment).toBe('Trimmed comment');
    });

    it('should reject empty comments', async () => {
      const response = await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: '' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Comment text is required');
    });

    it('should reject whitespace-only comments', async () => {
      const response = await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Comment text is required');
    });

    it('should reject comments over 280 characters', async () => {
      const longComment = 'a'.repeat(281);

      const response = await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: longComment });

      expect(response.status).toBe(400);
      // Validator message
      const msg = response.body.message || response.body.error || '';
      expect(msg.toLowerCase()).toContain('not have more than 280 characters');
    });

    it('should accept comments exactly 280 characters', async () => {
      const maxComment = 'a'.repeat(280);

      const response = await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: maxComment });

      expect(response.status).toBe(201);
      expect(response.body.comment.length).toBe(280);
    });

    it('should reject comments on non-existent pin', async () => {
      const response = await request(app)
        .post('/api/pins/99999/comments')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: 'Comment on nothing' });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Pin not found');
    });

    it('should allow another user to comment on a pin', async () => {
      const response = await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ comment: 'Comment from other user' });

      expect(response.status).toBe(201);
      expect(response.body.accountID).toBe(otherUserId);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .send({ comment: 'Unauthenticated comment' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/pins/:pinId/comments', () => {
    beforeEach(() => {
      createTestComment(pinId, userId, 'First comment');
      createTestComment(pinId, otherUserId, 'Second comment');
      createTestComment(pinId, userId, 'Third comment');
    });

    it('should return all comments for a pin', async () => {
      const response = await request(app)
        .get(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(3);
    });

    it('should include user email in comments', async () => {
      const response = await request(app)
        .get(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.body[0]).toHaveProperty('email');
    });

    it('should return comments in descending order by createdAt', async () => {
      const response = await request(app)
        .get(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`);

      // Most recent should be first (Third comment was created last)
      const dates = response.body.map((c: any) => new Date(c.createdAt).getTime());
      const sortedDates = [...dates].sort((a, b) => b - a);
      expect(dates).toEqual(sortedDates);
    });

    it('should return empty array for pin with no comments', async () => {
      const newPinId = createTestPin(userId, { title: 'No Comments Pin' });

      const response = await request(app)
        .get(`/api/pins/${newPinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/pins/${pinId}/comments`);
      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/comments/:commentId', () => {
    let commentId: number;

    beforeEach(() => {
      commentId = createTestComment(pinId, userId, 'Original comment');
    });

    it('should update own comment', async () => {
      const response = await request(app)
        .put(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: 'Updated comment' });

      expect(response.status).toBe(200);
      expect(response.body.comment).toBe('Updated comment');
    });

    it('should trim whitespace on update', async () => {
      const response = await request(app)
        .put(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: '  Updated with spaces  ' });

      expect(response.status).toBe(200);
      expect(response.body.comment).toBe('Updated with spaces');
    });

    it('should reject update with empty comment', async () => {
      const response = await request(app)
        .put(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: '' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Comment text is required');
    });

    it('should reject update over 280 characters', async () => {
      const response = await request(app)
        .put(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: 'x'.repeat(281) });

      expect(response.status).toBe(400);
      const msg = response.body.message || response.body.error || '';
      expect(msg.toLowerCase()).toContain('not have more than 280 characters');
    });

    it('should reject update by non-owner', async () => {
      const response = await request(app)
        .put(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ comment: 'Hacked comment' });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Unauthorized to update this comment');
    });

    it('should return 404 for non-existent comment', async () => {
      const response = await request(app)
        .put('/api/comments/99999')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: 'Update ghost' });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Comment not found');
    });
  });

  describe('DELETE /api/comments/:commentId', () => {
    let commentId: number;

    beforeEach(() => {
      commentId = createTestComment(pinId, userId, 'To be deleted');
    });

    it('should delete own comment', async () => {
      const response = await request(app)
        .delete(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Comment deleted successfully');

      // Verify comment is gone
      const getResponse = await request(app)
        .get(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(getResponse.body.find((c: any) => c.id === commentId)).toBeUndefined();
    });

    it('should reject deletion by non-owner', async () => {
      const response = await request(app)
        .delete(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Unauthorized to delete this comment');
    });

    it('should return 404 for non-existent comment', async () => {
      const response = await request(app)
        .delete('/api/comments/99999')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Comment not found');
    });
  });

  describe('Comment Relationships', () => {
    it('should not delete comments when fetching them', async () => {
      createTestComment(pinId, userId, 'Persistent comment');

      // Fetch twice
      await request(app)
        .get(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`);

      const response = await request(app)
        .get(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.body.length).toBe(1);
    });

    it('should support multiple comments per user on same pin', async () => {
      await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: 'First' });

      await request(app)
        .post(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: 'Second' });

      const response = await request(app)
        .get(`/api/pins/${pinId}/comments`)
        .set('Authorization', `Bearer ${userToken}`);

      const userComments = response.body.filter((c: any) => c.accountID === userId);
      expect(userComments.length).toBe(2);
    });
  });
});
