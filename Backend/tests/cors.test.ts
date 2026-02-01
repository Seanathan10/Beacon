/**
 * End-to-End Tests for CORS
 *
 * Ensures allowed origins receive CORS headers and disallowed origins are blocked.
 */

import request from 'supertest';
import { createTestApp } from './helpers/testApp';

const app = createTestApp();

describe('CORS', () => {
  it('should allow requests from known origins', async () => {
    const origin = 'http://localhost:5173';
    const response = await request(app).get('/heartbeat').set('Origin', origin);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
  });

  it('should block requests from unknown origins', async () => {
    const response = await request(app)
      .get('/heartbeat')
      .set('Origin', 'http://malicious.example.com');

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Internal Server Error');
    expect(response.body.error).toContain('CORS blocked for origin');
  });

  it('should return 204 for preflight requests', async () => {
    const origin = 'http://localhost:5173';
    const response = await request(app)
      .options('/api/pins')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(204);
  });
});
