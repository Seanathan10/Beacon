/**
 * Rate Limiting Tests
 *
 * Verifies the in-memory rate limiter on auth endpoints:
 * - 10 requests per 15 minutes per IP are allowed
 * - The 11th request within the window receives 429
 * - Retry-After header is present on 429 responses
 */

import request from 'supertest';
import { createTestApp } from './helpers/testApp';
import { clearRateLimitStoreForTesting } from '../index';

let app: any;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  clearRateLimitStoreForTesting();
});

describe('Rate Limiting', () => {
  describe('POST /api/login', () => {
    it('should allow up to 10 requests per window', async () => {
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/api/login')
          .send({ email: `user${i}@example.com`, password: 'wrongpass1' });

        // 401 (wrong creds) is fine — we just need it NOT to be 429
        expect(response.status).not.toBe(429);
      }
    });

    it('should return 429 on the 11th request within the window', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/login')
          .send({ email: `user${i}@example.com`, password: 'wrongpass1' });
      }

      const response = await request(app)
        .post('/api/login')
        .send({ email: 'overflow@example.com', password: 'wrongpass1' });

      expect(response.status).toBe(429);
      expect(response.body.message).toMatch(/too many requests/i);
    });

    it('should include Retry-After header on 429', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/login')
          .send({ email: `user${i}@example.com`, password: 'wrongpass1' });
      }

      const response = await request(app)
        .post('/api/login')
        .send({ email: 'overflow@example.com', password: 'wrongpass1' });

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBeDefined();
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('POST /api/register', () => {
    it('should return 429 on the 11th register attempt within the window', async () => {
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/register')
          .send({ email: `reg${i}@example.com`, password: 'pass1234' });
      }

      const response = await request(app)
        .post('/api/register')
        .send({ email: 'overflow@example.com', password: 'pass1234' });

      expect(response.status).toBe(429);
    });
  });

  describe('POST /api/share', () => {
    it('should allow up to 100 requests per window', async () => {
      for (let i = 0; i < 100; i++) {
        const response = await request(app)
          .post('/api/share')
          .send({ itinerary: { days: [] } });
        expect(response.status).not.toBe(429);
      }
    });

    it('should return 429 on the 101st request within the window', async () => {
      for (let i = 0; i < 100; i++) {
        await request(app)
          .post('/api/share')
          .send({ itinerary: { days: [] } });
      }

      const response = await request(app)
        .post('/api/share')
        .send({ itinerary: { days: [] } });

      expect(response.status).toBe(429);
      expect(response.body.message).toMatch(/too many requests/i);
    });

    it('should include Retry-After header on 429', async () => {
      for (let i = 0; i < 100; i++) {
        await request(app)
          .post('/api/share')
          .send({ itinerary: { days: [] } });
      }

      const response = await request(app)
        .post('/api/share')
        .send({ itinerary: { days: [] } });

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBeDefined();
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('Rate limit isolation', () => {
    it('should reset after clearRateLimitStoreForTesting is called', async () => {
      // Exhaust the limit
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/login')
          .send({ email: `user${i}@example.com`, password: 'wrongpass1' });
      }

      const blocked = await request(app)
        .post('/api/login')
        .send({ email: 'overflow@example.com', password: 'wrongpass1' });

      expect(blocked.status).toBe(429);

      // Clear and retry
      clearRateLimitStoreForTesting();

      const allowed = await request(app)
        .post('/api/login')
        .send({ email: 'retry@example.com', password: 'wrongpass1' });

      expect(allowed.status).not.toBe(429);
    });
  });
});
