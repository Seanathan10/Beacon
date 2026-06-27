import request from 'supertest';
import { createTestApp, createTestPin, createTestPost, createTestUser } from './helpers/testApp';
import { query } from '../database/db';

let app: any;

beforeAll(async () => {
  app = await createTestApp();
});

function makePrivate(userId: number) {
  query("UPDATE account SET profileVisibility = 'private' WHERE id = ?", [userId]);
}

function addPinLikes(pinId: number, count: number) {
  for (let i = 0; i < count; i++) {
    query('INSERT INTO account (email, password, name) VALUES (?, ?, ?)', [
      `search-like-${pinId}-${i}@example.com`,
      'hash',
      'Liker',
    ]);
    const [{ id }] = query('SELECT last_insert_rowid() as id');
    query('INSERT INTO likes (pinID, accountID) VALUES (?, ?)', [pinId, id]);
  }
}

describe('GET /api/search', () => {
  it('returns grouped pin and post matches with title matches ranked first', async () => {
    const user = await createTestUser('searcher@example.com', 'pass123', 'Searcher');

    const titlePin = createTestPin(user.userId, {
      title: 'Coffee Garden',
      description: 'Sunny patio',
      tags: JSON.stringify(['local']),
    });
    const bodyPin = createTestPin(user.userId, {
      title: 'Hidden Patio',
      description: 'Small-batch coffee stand',
      tags: JSON.stringify(['local']),
    });
    addPinLikes(bodyPin, 20);

    const postId = createTestPost(user.userId, {
      title: 'Coffee popup this weekend',
      message: 'Try the espresso cart.',
      tags: 'coffee,popup',
    });

    const res = await request(app)
      .get('/api/search?q=coffee')
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body.query).toBe('coffee');
    expect(res.body.pins.map((p: any) => p.id)).toEqual([titlePin, bodyPin]);
    expect(res.body.posts.map((p: any) => p.id)).toContain(postId);
    expect(res.body.posts[0].tags).toEqual(expect.arrayContaining(['coffee']));
  });

  it('enforces per-group limits', async () => {
    const user = await createTestUser('search-limit@example.com', 'pass123', 'Limiter');
    createTestPin(user.userId, { title: 'Matcha One' });
    createTestPin(user.userId, { title: 'Matcha Two' });
    createTestPin(user.userId, { title: 'Matcha Three' });

    const res = await request(app)
      .get('/api/search?q=matcha&limit=2')
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body.pins).toHaveLength(2);
  });

  it('rejects missing queries', async () => {
    const user = await createTestUser('search-empty@example.com', 'pass123', 'Empty');

    const res = await request(app)
      .get('/api/search')
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(400);
  });

  it('excludes pins and posts from private creators for third-party viewers', async () => {
    const privateUser = await createTestUser('search-private@example.com', 'pass123', 'Private');
    const viewer = await createTestUser('search-viewer@example.com', 'pass123', 'Viewer');
    const hiddenPin = createTestPin(privateUser.userId, { title: 'Secret Noodle Cart' });
    const hiddenPost = createTestPost(privateUser.userId, { title: 'Secret Noodle Notes' });
    makePrivate(privateUser.userId);

    const res = await request(app)
      .get('/api/search?q=secret')
      .set('Authorization', `Bearer ${viewer.token}`);

    expect(res.status).toBe(200);
    expect(res.body.pins.map((p: any) => p.id)).not.toContain(hiddenPin);
    expect(res.body.posts.map((p: any) => p.id)).not.toContain(hiddenPost);
  });

  it('still lets private creators search their own content', async () => {
    const privateUser = await createTestUser('search-private-own@example.com', 'pass123', 'Private');
    const ownPin = createTestPin(privateUser.userId, { title: 'Secret Garden Market' });
    const ownPost = createTestPost(privateUser.userId, { title: 'Secret Garden Guide' });
    makePrivate(privateUser.userId);

    const res = await request(app)
      .get('/api/search?q=secret')
      .set('Authorization', `Bearer ${privateUser.token}`);

    expect(res.status).toBe(200);
    expect(res.body.pins.map((p: any) => p.id)).toContain(ownPin);
    expect(res.body.posts.map((p: any) => p.id)).toContain(ownPost);
  });
});

describe('Discovery privacy routes', () => {
  it('POST /api/pins/nearby excludes private creator pins for third-party viewers', async () => {
    const privateUser = await createTestUser('nearby-private@example.com', 'pass123', 'Private');
    const viewer = await createTestUser('nearby-viewer@example.com', 'pass123', 'Viewer');
    const hiddenPin = createTestPin(privateUser.userId, {
      title: 'Hidden Nearby',
      latitude: 37.775,
      longitude: -122.419,
    });
    makePrivate(privateUser.userId);

    const res = await request(app)
      .post('/api/pins/nearby')
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({ latitude: 37.7749, longitude: -122.4194 });

    expect(res.status).toBe(200);
    expect(res.body.map((p: any) => p.id)).not.toContain(hiddenPin);
  });

  it('GET /api/posts/nearby resolves before /api/posts/:id', async () => {
    const user = await createTestUser('nearby-posts@example.com', 'pass123', 'Poster');
    const postId = createTestPost(user.userId, { title: 'Nearby Post' });
    query('UPDATE post SET latitude = 37.775, longitude = -122.419 WHERE id = ?', [postId]);

    const bbox = encodeURIComponent('-122.5,37.7,-122.3,37.9');
    const res = await request(app)
      .get(`/api/posts/nearby?bbox=${bbox}`)
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body.map((p: any) => p.id)).toContain(postId);
  });
});
