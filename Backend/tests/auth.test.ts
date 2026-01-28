/**
 * End-to-End Tests for Auth
 *
 * Tests for user registration and login functionality including:
 * - User registration with valid/invalid data
 * - User login with correct/incorrect credentials
 * - JWT token validation
 * - Protected route access
 */

import request from 'supertest';
import { createTestApp, createTestUser } from './helpers/testApp';
import { getTestDb } from './setup';

const app = createTestApp();

describe('Authentication', () => {
  describe('POST /api/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app).post('/api/register').send({
        email: 'newuser@example.com',
        password: 'securepassword123',
        name: 'New User',
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body.user).toEqual({
        id: expect.any(Number),
        email: 'newuser@example.com',
        name: 'New User',
      });
    });

    it('should register a user without a name', async () => {
      const response = await request(app).post('/api/register').send({
        email: 'noname@example.com',
        password: 'securepassword123',
      });

      expect(response.status).toBe(201);
      expect(response.body.user.name).toBeNull();
    });

    it('should reject duplicate email registration', async () => {
      // First registration
      await request(app).post('/api/register').send({
        email: 'duplicate@example.com',
        password: 'password123',
        name: 'First User',
      });

      // Second registration with same email
      const response = await request(app).post('/api/register').send({
        email: 'duplicate@example.com',
        password: 'different123',
        name: 'Second User',
      });

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Email already registered');
    });

    it('should hash the password before storing', async () => {
      await request(app).post('/api/register').send({
        email: 'hashtest@example.com',
        password: 'plaintextpassword',
        name: 'Hash Test',
      });

      const db = getTestDb();
      const stmt = db.prepare('SELECT password FROM account WHERE email = ?');
      const result = stmt.get('hashtest@example.com') as { password: string };

      // Password should be hashed (bcrypt hashes start with $2b$)
      expect(result.password).toMatch(/^\$2[aby]\$/);
      expect(result.password).not.toBe('plaintextpassword');
    });

    it('should return a valid JWT token', async () => {
      const response = await request(app).post('/api/register').send({
        email: 'jwttest@example.com',
        password: 'password123',
        name: 'JWT Test',
      });

      const token = response.body.accessToken;

      // Token should have 3 parts separated by dots
      expect(token.split('.').length).toBe(3);

      // Should be able to use the token to access protected routes
      const protectedResponse = await request(app)
        .get('/api/pins')
        .set('Authorization', `Bearer ${token}`);

      expect(protectedResponse.status).toBe(200);
    });
  });

  describe('POST /api/login', () => {
    beforeEach(async () => {
      await createTestUser('login@example.com', 'correctpassword', 'Login User');
    });

    it('should login with correct credentials', async () => {
      const response = await request(app).post('/api/login').send({
        email: 'login@example.com',
        password: 'correctpassword',
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body.user).toEqual({
        id: expect.any(Number),
        email: 'login@example.com',
        name: 'Login User',
      });
    });

    it('should reject login with incorrect password', async () => {
      const response = await request(app).post('/api/login').send({
        email: 'login@example.com',
        password: 'wrongpassword',
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app).post('/api/login').send({
        email: 'nonexistent@example.com',
        password: 'anypassword',
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return a usable JWT token', async () => {
      const response = await request(app).post('/api/login').send({
        email: 'login@example.com',
        password: 'correctpassword',
      });

      const token = response.body.accessToken;

      // Use token to access protected route
      const protectedResponse = await request(app)
        .get('/api/pins')
        .set('Authorization', `Bearer ${token}`);

      expect(protectedResponse.status).toBe(200);
    });
  });

  describe('Authentication Middleware', () => {
    it('should reject requests without authorization header', async () => {
      const response = await request(app).get('/api/pins');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('No token provided');
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/pins')
        .set('Authorization', 'Bearer invalidtoken');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid token');
    });

    it('should reject requests with malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/pins')
        .set('Authorization', 'NotBearer token');

      expect(response.status).toBe(401);
    });

    it('should accept requests with valid token', async () => {
      const { token } = await createTestUser();

      const response = await request(app)
        .get('/api/pins')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });
  });

  describe('Heartbeat (No Auth Required)', () => {
    it('should return ok status without authentication', async () => {
      const response = await request(app).get('/heartbeat');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        timestamp: expect.any(Number),
      });
    });
  });
});
