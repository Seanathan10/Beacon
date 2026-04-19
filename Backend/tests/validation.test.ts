/**
 * Request Validation Edge Cases
 *
 * These tests lock in expected behavior from express-openapi-validator
 * for path parameter types and basic schema mismatches.
 */

import request from 'supertest';
import { createTestApp, createTestUser, createTestPin, createTestPost, createTestComment } from './helpers/testApp';

let app: any;

beforeAll(async () => {
  app = await createTestApp();
});

describe('Request validation', () => {
  let token: string;
  let userId: number;

  beforeEach(async () => {
    const user = await createTestUser('validation@example.com', 'password123', 'Validator');
    token = user.token;
    userId = user.userId;
  });

  it('should reject register missing required fields', async () => {
    const missingEmail = await request(app).post('/api/register').send({
      password: 'password123',
    });

    expect(missingEmail.status).toBe(400);
    expect(missingEmail.body).toHaveProperty('message');

    const missingPassword = await request(app).post('/api/register').send({
      email: 'missingpass@example.com',
    });

    expect(missingPassword.status).toBe(400);
    expect(missingPassword.body).toHaveProperty('message');
  });

  it('should reject invalid email format on register', async () => {
    const response = await request(app).post('/api/register').send({
      email: 'not-an-email',
      password: 'password123',
      name: 'Valid Name',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('should reject register when name exceeds max length', async () => {
    const response = await request(app).post('/api/register').send({
      email: 'longname@example.com',
      password: 'password123',
      name: 'This Name Is Definitely Too Long',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('should reject login missing required fields', async () => {
    const missingEmail = await request(app).post('/api/login').send({
      password: 'password123',
    });

    expect(missingEmail.status).toBe(400);
    expect(missingEmail.body).toHaveProperty('message');

    const missingPassword = await request(app).post('/api/login').send({
      email: 'login@example.com',
    });

    expect(missingPassword.status).toBe(400);
    expect(missingPassword.body).toHaveProperty('message');
  });

  it('should reject invalid email format on login', async () => {
    const response = await request(app).post('/api/login').send({
      email: 'not-an-email',
      password: 'password123',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
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

  it('should reject create post when required fields are missing', async () => {
    const response = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Missing Message',
        location: 'Somewhere',
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('should reject create post with invalid tags type', async () => {
    const response = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Bad Tags',
        location: 'Somewhere',
        message: 'Hello',
        tags: { not: 'allowed' },
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('should ignore upvotes field in post update body (field removed from schema)', async () => {
    // upvotes is no longer an accepted field in PUT /api/posts/:id — it is derived
    // from the post_upvote junction table and cannot be set directly.
    // Unknown extra fields are silently ignored by the validator.
    const postId = createTestPost(userId, { title: 'T', location: 'L', message: 'M' });

    const response = await request(app)
      .put(`/api/posts/${postId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ upvotes: 'not-a-number' });

    expect(response.status).toBe(200);
    expect(response.body.upvotes).toBe(0);
  });

  it('should reject create pin when required fields are missing', async () => {
    const response = await request(app)
      .post('/api/pins')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 37.7749 });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });

  it('should reject create pin with invalid tags type', async () => {
    const response = await request(app)
      .post('/api/pins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        latitude: 37.7749,
        longitude: -122.4194,
        tags: { invalid: true },
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

  describe('Boundary Value Validation', () => {
    it('should accept email at maximum length', async () => {
      // Schema allows up to 254 characters (RFC 5321 max)
      const longEmail = 'a'.repeat(240) + '@example.com'; // 252 chars — within limit
      const response = await request(app).post('/api/register').send({
        email: longEmail,
        password: 'password123',
      });
      expect(response.status).toBe(201);
    });

    it('should accept password at minimum length', async () => {
      // No minimum password length is enforced in the OpenAPI schema
      const response = await request(app).post('/api/register').send({
        email: 'minpass@example.com',
        password: '1',
      });
      expect(response.status).toBe(201);
    });

    it('should accept very long passwords', async () => {
      // bcrypt silently truncates input at 72 bytes and still succeeds
      const longPassword = 'a'.repeat(1000);
      const response = await request(app).post('/api/register').send({
        email: 'longpass@example.com',
        password: longPassword,
      });
      expect(response.status).toBe(201);
    });

    it('should accept pin coordinates at exact boundaries', async () => {
      const boundaryTests = [
        { latitude: 90, longitude: 180 },
        { latitude: -90, longitude: -180 },
        { latitude: 90, longitude: -180 },
        { latitude: -90, longitude: 180 },
      ];

      for (const coords of boundaryTests) {
        const response = await request(app)
          .post('/api/pins')
          .set('Authorization', `Bearer ${token}`)
          .send(coords);

        expect(response.status).toBe(201);
      }
    });

    it('should reject pin coordinates beyond boundaries', async () => {
      const invalidTests = [
        { latitude: 91, longitude: 0 },
        { latitude: -91, longitude: 0 },
        { latitude: 0, longitude: 181 },
        { latitude: 0, longitude: -181 },
      ];

      for (const coords of invalidTests) {
        const response = await request(app)
          .post('/api/pins')
          .set('Authorization', `Bearer ${token}`)
          .send(coords);

        // Should be rejected
        expect(response.status).toBe(400);
      }
    });

    it('should ignore upvotes field entirely (not in schema, cannot be set directly)', async () => {
      // upvotes was removed from the updatePost request schema because it is derived
      // from the post_upvote junction table. Sending any upvotes value is a no-op.
      const postId = createTestPost(userId, { title: 'T', location: 'L', message: 'M' });

      for (const upvotes of [-5, 0, 999999]) {
        const response = await request(app)
          .put(`/api/posts/${postId}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ upvotes });

        expect(response.status).toBe(200);
        expect(response.body.upvotes).toBe(0);
      }
    });
  });

  describe('Array Validation', () => {
    it('should accept extremely large tag arrays (no maxItems constraint)', async () => {
      // The OpenAPI spec has no maxItems on tags, and SQLite does not enforce
      // VARCHAR(500), so large arrays are stored as a long CSV string.
      const hugeTags = Array(1000).fill('tag');

      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Too Many Tags',
          location: 'Location',
          message: 'Message',
          tags: hugeTags,
        });

      expect(response.status).toBe(201);
    });

    it('should accept reasonable tag array sizes', async () => {
      const reasonableTags = ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'];

      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Good Tags',
          location: 'Location',
          message: 'Message',
          tags: reasonableTags,
        });

      expect(response.status).toBe(201);
      expect(response.body.tags).toEqual(reasonableTags);
    });
  });
});
