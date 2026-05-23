/**
 * End-to-End Tests for CORS
 *
 * Ensures allowed origins receive CORS headers and disallowed origins are blocked.
 */

import request from 'supertest';
import { createTestApp } from './helpers/testApp';

let app: any;

beforeAll(async () => {
  app = await createTestApp();
});

describe('CORS', () => {
  describe('Allowed Origins', () => {
    it('should allow requests from localhost:5173', async () => {
      const origin = 'http://localhost:5173';
      const response = await request(app).get('/heartbeat').set('Origin', origin);

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
    });

    it('should allow requests from localhost:3000', async () => {
      const origin = 'http://localhost:3000';
      const response = await request(app).get('/heartbeat').set('Origin', origin);

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
    });
  });

  describe('Blocked Origins', () => {
    it('should block requests from unknown origins', async () => {
      const response = await request(app)
        .get('/heartbeat')
        .set('Origin', 'http://malicious.example.com');

      // CORS blocks by omitting the Access-Control-Allow-Origin header;
      // browsers enforce the block client-side, server returns no CORS header.
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should block requests from similar but different origins', async () => {
      const response = await request(app)
        .get('/heartbeat')
        .set('Origin', 'http://localhost:5174');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Preflight Requests', () => {
    it('should return 204 for GET preflight requests', async () => {
      const origin = 'http://localhost:5173';
      const response = await request(app)
        .options('/api/pins')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);
    });

    it('should return 204 for POST preflight requests', async () => {
      const origin = 'http://localhost:5173';
      const response = await request(app)
        .options('/api/pins')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST');

      expect(response.status).toBe(204);
    });

    it('should return 204 for PUT preflight requests', async () => {
      const origin = 'http://localhost:5173';
      const response = await request(app)
        .options('/api/posts/1')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'PUT');

      expect(response.status).toBe(204);
    });

    it('should return 204 for DELETE preflight requests', async () => {
      const origin = 'http://localhost:5173';
      const response = await request(app)
        .options('/api/pins/1')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'DELETE');

      expect(response.status).toBe(204);
    });
  });

  describe('CORS Headers', () => {
    it('should not send Access-Control-Allow-Credentials (Bearer token API)', async () => {
      const origin = 'http://localhost:5173';
      const response = await request(app).get('/heartbeat').set('Origin', origin);

      // API uses Bearer token auth, not cookie-based credentials; header should not be 'true'
      expect(response.headers['access-control-allow-credentials']).not.toBe('true');
    });

    it('should include allowed methods in preflight', async () => {
      const origin = 'http://localhost:5173';
      const response = await request(app)
        .options('/api/pins')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });
  });
});
