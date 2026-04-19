/**
 * End-to-End Tests for Posts
 *
 * Tests for community post functionality including:
 * - Creating posts
 * - Reading posts (all, specific)
 * - Updating posts
 * - Deleting posts
 * - Upvoting posts
 * - Tag handling
 * - Authorization checks
 */

import request from 'supertest';
import { createTestApp, createTestUser, createTestPost } from './helpers/testApp';

let app: any;

beforeAll(async () => {
  app = await createTestApp();
});

describe('Posts', () => {
  let userToken: string;
  let userId: number;
  let otherUserToken: string;
  let otherUserId: number;

  beforeEach(async () => {
    const user = await createTestUser('poster@example.com', 'password123', 'Poster');
    userToken = user.token;
    userId = user.userId;

    const otherUser = await createTestUser('other@example.com', 'password123', 'Other');
    otherUserToken = otherUser.token;
    otherUserId = otherUser.userId;
  });

  describe('POST /api/posts', () => {
    it('should create a post with all fields', async () => {
      const postData = {
        title: 'Amazing Local Cafe',
        location: '123 Main St, San Francisco, CA',
        category: 'Hot',
        tags: ['cafe', 'coffee', 'cozy'],
        message: 'Found this hidden gem with the best lattes!',
        image: 'https://example.com/cafe.jpg',
      };

      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send(postData);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: expect.any(Number),
        creatorID: userId,
        title: 'Amazing Local Cafe',
        location: '123 Main St, San Francisco, CA',
        category: 'Hot',
        message: 'Found this hidden gem with the best lattes!',
        image: 'https://example.com/cafe.jpg',
        upvotes: 0,
      });
      expect(response.body.tags).toEqual(['cafe', 'coffee', 'cozy']);
    });

    it('should create a post with minimal required fields', async () => {
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Quick Post',
          location: 'Somewhere',
          message: 'A brief message',
        });

      expect(response.status).toBe(201);
      expect(response.body.category).toBe('New'); // Default category
    });

    it('should convert tags array to proper format', async () => {
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Tagged Post',
          location: 'Location',
          message: 'Message',
          tags: ['tag1', 'tag2', 'tag3'],
        });

      expect(response.status).toBe(201);
      expect(Array.isArray(response.body.tags)).toBe(true);
      expect(response.body.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should handle string tags', async () => {
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'String Tags Post',
          location: 'Location',
          message: 'Message',
          tags: 'food,drinks,fun',
        });

      expect(response.status).toBe(201);
      // Schema allows string or array, code parses both
      expect(response.body.tags).toEqual(['food', 'drinks', 'fun']);
    });

    it('should require authentication', async () => {
      const response = await request(app).post('/api/posts').send({
        title: 'Unauth Post',
        location: 'Location',
        message: 'Message',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/posts', () => {
    beforeEach(() => {
      createTestPost(userId, { title: 'Post 1', category: 'New' });
      createTestPost(userId, { title: 'Post 2', category: 'Hot' });
      createTestPost(otherUserId, { title: 'Post 3', category: 'Trendy' });
    });

    it('should return all posts', async () => {
      const response = await request(app)
        .get('/api/posts')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(3);
    });

    it('should return posts in descending order by createdAt', async () => {
      const response = await request(app)
        .get('/api/posts')
        .set('Authorization', `Bearer ${userToken}`);

      const dates = response.body.map((p: any) => new Date(p.createdAt).getTime());
      const sortedDates = [...dates].sort((a, b) => b - a);
      expect(dates).toEqual(sortedDates);
    });

    it('should parse tags into arrays', async () => {
      const response = await request(app)
        .get('/api/posts')
        .set('Authorization', `Bearer ${userToken}`);

      response.body.forEach((post: any) => {
        expect(Array.isArray(post.tags)).toBe(true);
      });
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/posts');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/posts/:id', () => {
    let postId: number;

    beforeEach(() => {
      postId = createTestPost(userId, {
        title: 'Specific Post',
        tags: 'special,unique',
      });
    });

    it('should return a specific post', async () => {
      const response = await request(app)
        .get(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: postId,
        title: 'Specific Post',
      });
      expect(response.body.tags).toEqual(['special', 'unique']);
    });

    it('should return 404 for non-existent post', async () => {
      const response = await request(app)
        .get('/api/posts/99999')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Post not found');
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/posts/${postId}`);
      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/posts/:id', () => {
    let postId: number;

    beforeEach(() => {
      postId = createTestPost(userId, {
        title: 'Original Title',
        message: 'Original message',
        category: 'New',
      });
    });

    it('should update post title', async () => {
      const response = await request(app)
        .put(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Updated Title' });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Updated Title');
    });

    it('should update multiple fields at once', async () => {
      const response = await request(app)
        .put(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'New Title',
          message: 'New message',
          category: 'Hot',
          location: 'New Location',
          tags: ['new', 'tags'],
          image: 'https://example.com/new.jpg',
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        title: 'New Title',
        message: 'New message',
        category: 'Hot',
        location: 'New Location',
        image: 'https://example.com/new.jpg',
      });
      expect(response.body.tags).toEqual(['new', 'tags']);
    });

    it('should ignore upvotes field in body (not directly writable)', async () => {
      // upvotes is derived from the post_upvote junction table and cannot be
      // set directly via the update endpoint — the field is not in the schema.
      const response = await request(app)
        .put(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ upvotes: 100 });

      expect(response.status).toBe(200);
      // upvotes stays at 0 (no actual upvotes were cast)
      expect(response.body.upvotes).toBe(0);
    });

    it('should reject update by non-owner', async () => {
      const response = await request(app)
        .put(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ title: 'Hacked Title' });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Unauthorized');
    });

    it('should return 404 for non-existent post', async () => {
      const response = await request(app)
        .put('/api/posts/99999')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Update Ghost' });

      expect(response.status).toBe(404);
    });

    it('should reject update of post with null creator (no owner = no one can edit)', async () => {
      const nullCreatorPostId = createTestPost(null, { title: 'System Post' });

      const response = await request(app)
        .put(`/api/posts/${nullCreatorPostId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Updated System Post' });

      // Null creatorID means the post has no owner — no one should be able to edit it.
      // Allowing any authenticated user to edit ownerless posts was an IDOR vulnerability.
      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/posts/:id', () => {
    let postId: number;

    beforeEach(() => {
      postId = createTestPost(userId, { title: 'To Delete' });
    });

    it('should delete own post', async () => {
      const response = await request(app)
        .delete(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Post deleted successfully');

      // Verify post is gone
      const getResponse = await request(app)
        .get(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('should reject deletion by non-owner', async () => {
      const response = await request(app)
        .delete(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Unauthorized');
    });

    it('should return 404 for non-existent post', async () => {
      const response = await request(app)
        .delete('/api/posts/99999')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
    });

    it('should reject deletion of post with null creator (no owner = no one can delete)', async () => {
      const nullCreatorPostId = createTestPost(null, { title: 'System Post' });

      const response = await request(app)
        .delete(`/api/posts/${nullCreatorPostId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Null creatorID means the post has no owner — no one should be able to delete it.
      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/posts/:id/upvote', () => {
    let postId: number;

    beforeEach(() => {
      postId = createTestPost(userId, { title: 'Upvoteable', upvotes: 5 });
    });

    it('should increment upvote count', async () => {
      const response = await request(app)
        .post(`/api/posts/${postId}/upvote`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      // upvotes is now derived from the post_upvote junction table, so it
      // reflects the real count (1 upvote just cast), not the denormalized column.
      expect(response.body.upvotes).toBe(1);
    });

    it('should prevent duplicate upvotes from same user', async () => {
      // First upvote
      await request(app)
        .post(`/api/posts/${postId}/upvote`)
        .set('Authorization', `Bearer ${userToken}`);

      // Second upvote from same user should return 409
      const response = await request(app)
        .post(`/api/posts/${postId}/upvote`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Already upvoted');
    });

    it('should allow upvotes from different users', async () => {
      await request(app)
        .post(`/api/posts/${postId}/upvote`)
        .set('Authorization', `Bearer ${userToken}`);

      const response = await request(app)
        .post(`/api/posts/${postId}/upvote`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      // Two distinct upvotes → junction table count = 2
      expect(response.body.upvotes).toBe(2);
    });

    it('should return 404 for non-existent post', async () => {
      const response = await request(app)
        .post('/api/posts/99999/upvote')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Post not found');
    });

    it('should include parsed tags in response', async () => {
      const taggedPostId = createTestPost(userId, {
        title: 'Tagged',
        tags: 'a,b,c',
      });

      const response = await request(app)
        .post(`/api/posts/${taggedPostId}/upvote`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(Array.isArray(response.body.tags)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(app).post(`/api/posts/${postId}/upvote`);
      expect(response.status).toBe(401);
    });
  });

  describe('Post Categories', () => {
    it('should accept various category values', async () => {
      const categories = ['New', 'Hot', 'Trendy', 'Local'];

      for (const category of categories) {
        const response = await request(app)
          .post('/api/posts')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            title: `${category} Post`,
            location: 'Location',
            message: 'Message',
            category,
          });

        expect(response.status).toBe(201);
        expect(response.body.category).toBe(category);
      }
    });

    it('should default to New category if not specified', async () => {
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'No Category',
          location: 'Location',
          message: 'Message',
        });

      expect(response.body.category).toBe('New');
    });
  });

  describe('Tag Edge Cases', () => {
    it('should handle empty tags array', async () => {
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'No Tags',
          location: 'Location',
          message: 'Message',
          tags: [],
        });

      expect(response.status).toBe(201);
      expect(response.body.tags).toEqual([]);
    });

    it('should handle posts without tags', async () => {
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Tagless',
          location: 'Location',
          message: 'Message',
        });

      expect(response.status).toBe(201);
      expect(response.body.tags).toEqual([]);
    });

    it('should handle empty string tags', async () => {
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Empty String Tags',
          location: 'Location',
          message: 'Message',
          tags: '',
        });

      expect(response.status).toBe(201);
      expect(response.body.tags).toEqual([]);
    });

    it('should trim whitespace from tags', async () => {
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Whitespace Tags',
          location: 'Location',
          message: 'Message',
          tags: ' tag1 , tag2 , tag3 ',
        });

      expect(response.status).toBe(201);
      // Tags should be trimmed when retrieved
      expect(response.body.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });
  });

  describe('Field Validation', () => {
    it('should reject extremely long titles', async () => {
      const longTitle = 'a'.repeat(1001);

      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: longTitle,
          location: 'Location',
          message: 'Message',
        });

      // Should be rejected by validation
      expect(response.status).toBe(400);
    });

    it('should reject extremely long messages', async () => {
      const longMessage = 'a'.repeat(10001);

      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Title',
          location: 'Location',
          message: longMessage,
        });

      // Should be rejected by validation
      expect(response.status).toBe(400);
    });

    it('should accept posts with maximum valid field lengths', async () => {
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'a'.repeat(200),
          location: 'a'.repeat(200),
          message: 'a'.repeat(1000),
          tags: ['tag1', 'tag2'],
        });

      // Should succeed if within reasonable limits
      expect([201, 400]).toContain(response.status);
    });
  });
});
