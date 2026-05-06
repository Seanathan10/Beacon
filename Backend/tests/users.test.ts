import request from 'supertest';
import { createTestApp, createTestUser, createTestPin } from './helpers/testApp';
import { query } from '../database/db';

let app: any;

beforeAll(async () => {
    app = await createTestApp();
});

describe('User profiles', () => {
    it('GET /api/users/:userID returns public profile', async () => {
        const user = await createTestUser('profile@example.com', 'pass123', 'Alice');
        const viewer = await createTestUser('viewer@example.com', 'pass123', 'Bob');

        const res = await request(app)
            .get(`/api/users/${user.userId}`)
            .set('Authorization', `Bearer ${viewer.token}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(user.userId);
        expect(res.body.name).toBe('Alice');
        expect(res.body.followerCount).toBe(0);
        expect(res.body.followingCount).toBe(0);
        expect(res.body.isFollowed).toBe(false);
        expect(res.body).not.toHaveProperty('password');
    });

    it('GET /api/users/:userID returns isOwn=true for own profile', async () => {
        const user = await createTestUser('own@example.com', 'pass123', 'OwnUser');

        const res = await request(app)
            .get(`/api/users/${user.userId}`)
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        expect(res.body.isOwn).toBe(true);
    });

    it('GET /api/users/:userID returns 404 for missing user', async () => {
        const user = await createTestUser('notfound@example.com', 'pass123', 'User');
        const res = await request(app)
            .get('/api/users/99999')
            .set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(404);
    });

    it('GET /api/users/:userID returns 403 for private profile', async () => {
        const privateUser = await createTestUser('private@example.com', 'pass123', 'Private');
        query("UPDATE account SET profileVisibility = 'private' WHERE id = ?", [privateUser.userId]);

        const viewer = await createTestUser('pviewer@example.com', 'pass123', 'Viewer');
        const res = await request(app)
            .get(`/api/users/${privateUser.userId}`)
            .set('Authorization', `Bearer ${viewer.token}`);
        expect(res.status).toBe(403);
    });

    it('PATCH /api/me updates bio and visibility', async () => {
        const user = await createTestUser('patch@example.com', 'pass123', 'Patcher');

        const res = await request(app)
            .patch('/api/me')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ bio: 'Hello world', profileVisibility: 'friends' });

        expect(res.status).toBe(200);
        expect(res.body.bio).toBe('Hello world');
        expect(res.body.profileVisibility).toBe('friends');
    });

    it('PATCH /api/me rejects bio over 300 chars', async () => {
        const user = await createTestUser('longbio@example.com', 'pass123', 'Biouser');
        const res = await request(app)
            .patch('/api/me')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ bio: 'x'.repeat(301) });
        expect(res.status).toBe(400);
    });

    it('GET /api/users/:userID/pins returns user pins', async () => {
        const creator = await createTestUser('pinowner@example.com', 'pass123', 'Creator');
        createTestPin(creator.userId, { title: 'My Pin' });

        const viewer = await createTestUser('pinviewer@example.com', 'pass123', 'Viewer');
        const res = await request(app)
            .get(`/api/users/${creator.userId}/pins`)
            .set('Authorization', `Bearer ${viewer.token}`);

        expect(res.status).toBe(200);
        expect(res.body.pins).toHaveLength(1);
        expect(res.body.hasMore).toBe(false);
    });

    it('GET /api/users/:userID/pins returns empty for private profile', async () => {
        const privateUser = await createTestUser('privpins@example.com', 'pass123', 'Private');
        query("UPDATE account SET profileVisibility = 'private' WHERE id = ?", [privateUser.userId]);
        createTestPin(privateUser.userId);

        const viewer = await createTestUser('privpinsviewer@example.com', 'pass123', 'Viewer');
        const res = await request(app)
            .get(`/api/users/${privateUser.userId}/pins`)
            .set('Authorization', `Bearer ${viewer.token}`);

        expect(res.status).toBe(200);
        expect(res.body.pins).toHaveLength(0);
    });
});

describe('Stats endpoints', () => {
    it('GET /api/me/stats returns zeros for new user', async () => {
        const user = await createTestUser('stats@example.com', 'pass123', 'StatsUser');
        const res = await request(app)
            .get('/api/me/stats')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        expect(res.body.pinsCreated).toBe(0);
        expect(res.body.likesReceived).toBe(0);
        expect(res.body.placesVisited).toBe(0);
    });

    it('GET /api/me/stats counts pins correctly', async () => {
        const user = await createTestUser('statspins@example.com', 'pass123', 'StatsUser2');
        createTestPin(user.userId);
        createTestPin(user.userId);

        const res = await request(app)
            .get('/api/me/stats')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        expect(res.body.pinsCreated).toBe(2);
    });

    it('GET /api/me/activity returns empty array for new user', async () => {
        const user = await createTestUser('activity@example.com', 'pass123', 'ActivityUser');
        const res = await request(app)
            .get('/api/me/activity')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});

describe('auth.optional middleware', () => {
    it('GET /api/users/:userID returns public profile without authentication', async () => {
        const user = await createTestUser('noauth@example.com', 'pass123', 'NoAuthUser');

        const res = await request(app)
            .get(`/api/users/${user.userId}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(user.userId);
        expect(res.body.name).toBe('NoAuthUser');
        expect(res.body.isFollowed).toBe(false);
    });

    it('GET /api/users/:userID returns 403 for private profile without authentication', async () => {
        const priv = await createTestUser('noauthpriv@example.com', 'pass123', 'PrivUser');
        query("UPDATE account SET profileVisibility = 'private' WHERE id = ?", [priv.userId]);

        const res = await request(app)
            .get(`/api/users/${priv.userId}`);

        expect(res.status).toBe(403);
    });

    it('GET /api/users/:userID/pins returns empty for private profile without authentication', async () => {
        const priv = await createTestUser('noauthprivpins@example.com', 'pass123', 'PrivPins');
        query("UPDATE account SET profileVisibility = 'private' WHERE id = ?", [priv.userId]);

        const res = await request(app)
            .get(`/api/users/${priv.userId}/pins`);

        expect(res.status).toBe(200);
        expect(res.body.pins).toHaveLength(0);
    });
});
