/**
 * Request Validation Edge Cases
 *
 * These tests lock in expected behavior from express-openapi-validator
 * for path parameter types and basic schema mismatches.
 */

import request from 'supertest';
import { createTestApp, createTestUser, createTestPin, createTestPost, createTestComment } from './helpers/testApp';

const app = createTestApp();

describe('Request validation', () => {
  let token: string;
  let userId: number;

  beforeEach(async () => {
    const user = await createTestUser('validation@example.com', 'password123', 'Validator');
    token = user.token;
    userId = user.userId;
  });

  it('should reject non-integer pin id path params', async () => {
    const response = await request(app)
      .get('/api/pins/not-a-number')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('should reject non-integer post id path params', async () => {
    const response = await request(app)
      .get('/api/posts/not-a-number')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('should reject non-integer like id path params', async () => {
    const response = await request(app)
      .get('/api/likes/not-a-number')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('should reject non-integer comment id path params', async () => {
    const response = await request(app)
      .put('/api/comments/not-a-number')
      .set('Authorization', `Bearer ${token}`)
      .send({ comment: 'hello' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('should reject invalid body types for create post', async () => {
    const response = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 123,
        location: 'Somewhere',
        message: 'hi',
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('should allow an empty object body for pins update (request present but no fields)', async () => {
    const pinId = createTestPin(userId, { title: 'T' });

    const response = await request(app)
      .put(`/api/pins/${pinId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    // Current handler treats this as no-op and returns the pin.
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', pinId);
  });

  it('should allow an empty object body for posts update (request present but no fields)', async () => {
    const postId = createTestPost(userId, { title: 'T', location: 'L', message: 'M' });

    const response = await request(app)
      .put(`/api/posts/${postId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', postId);
  });

  it('should reject empty comment update (app-level validation)', async () => {
    const pinId = createTestPin(userId, { title: 'T' });
    const commentId = createTestComment(pinId, userId, 'hi');

    const response = await request(app)
      .put(`/api/comments/${commentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ comment: '   ' });

    // This is handler validation, not OpenAPI.
    expect(response.status).toBe(400);
  });
});
