import request from 'supertest';
import { createTestApp, createTestUser } from './helpers/testApp';
import { query } from '../database/db';

let app: any;

beforeAll(async () => {
    app = await createTestApp();
});

describe('Follow system', () => {
    it('POST /api/users/:userID/follow follows a user', async () => {
        const alice = await createTestUser('alice@example.com', 'pass123', 'Alice');
        const bob = await createTestUser('bob@example.com', 'pass123', 'Bob');

        const res = await request(app)
            .post(`/api/users/${bob.userId}/follow`)
            .set('Authorization', `Bearer ${alice.token}`);

        expect(res.status).toBe(204);

        const row = query(
            'SELECT 1 FROM user_follow WHERE followerID = ? AND followingID = ?',
            [alice.userId, bob.userId]
        );
        expect(row.length).toBe(1);
    });

    it('POST /api/users/:userID/follow is idempotent', async () => {
        const alice = await createTestUser('alice2@example.com', 'pass123', 'Alice2');
        const bob = await createTestUser('bob2@example.com', 'pass123', 'Bob2');

        await request(app)
            .post(`/api/users/${bob.userId}/follow`)
            .set('Authorization', `Bearer ${alice.token}`);
        await request(app)
            .post(`/api/users/${bob.userId}/follow`)
            .set('Authorization', `Bearer ${alice.token}`);

        const rows = query(
            'SELECT * FROM user_follow WHERE followerID = ? AND followingID = ?',
            [alice.userId, bob.userId]
        );
        expect(rows.length).toBe(1);
    });

    it('POST /api/users/:userID/follow returns 400 for self-follow', async () => {
        const alice = await createTestUser('aliceself@example.com', 'pass123', 'Alice');
        const res = await request(app)
            .post(`/api/users/${alice.userId}/follow`)
            .set('Authorization', `Bearer ${alice.token}`);
        expect(res.status).toBe(400);
    });

    it('POST /api/users/:userID/follow returns 404 for missing user', async () => {
        const alice = await createTestUser('alice404@example.com', 'pass123', 'Alice');
        const res = await request(app)
            .post('/api/users/99999/follow')
            .set('Authorization', `Bearer ${alice.token}`);
        expect(res.status).toBe(404);
    });

    it('DELETE /api/users/:userID/follow unfollows a user', async () => {
        const alice = await createTestUser('alicedel@example.com', 'pass123', 'Alice');
        const bob = await createTestUser('bobdel@example.com', 'pass123', 'Bob');

        await request(app)
            .post(`/api/users/${bob.userId}/follow`)
            .set('Authorization', `Bearer ${alice.token}`);

        const res = await request(app)
            .delete(`/api/users/${bob.userId}/follow`)
            .set('Authorization', `Bearer ${alice.token}`);

        expect(res.status).toBe(204);
        const rows = query(
            'SELECT 1 FROM user_follow WHERE followerID = ? AND followingID = ?',
            [alice.userId, bob.userId]
        );
        expect(rows.length).toBe(0);
    });

    it('DELETE /api/users/:userID/follow returns 404 when not following', async () => {
        const alice = await createTestUser('alicenf@example.com', 'pass123', 'Alice');
        const bob = await createTestUser('bobnf@example.com', 'pass123', 'Bob');

        const res = await request(app)
            .delete(`/api/users/${bob.userId}/follow`)
            .set('Authorization', `Bearer ${alice.token}`);
        expect(res.status).toBe(404);
    });

    it('GET /api/users/:userID returns correct follower count', async () => {
        const alice = await createTestUser('alicecount@example.com', 'pass123', 'Alice');
        const bob = await createTestUser('bobcount@example.com', 'pass123', 'Bob');
        const carol = await createTestUser('carolcount@example.com', 'pass123', 'Carol');

        await request(app)
            .post(`/api/users/${bob.userId}/follow`)
            .set('Authorization', `Bearer ${alice.token}`);
        await request(app)
            .post(`/api/users/${bob.userId}/follow`)
            .set('Authorization', `Bearer ${carol.token}`);

        const res = await request(app)
            .get(`/api/users/${bob.userId}`)
            .set('Authorization', `Bearer ${alice.token}`);

        expect(res.status).toBe(200);
        expect(res.body.followerCount).toBe(2);
        expect(res.body.isFollowed).toBe(true);
    });

    it('GET /api/users/:userID/followers returns paginated followers', async () => {
        const alice = await createTestUser('alicefol@example.com', 'pass123', 'Alice');
        const bob = await createTestUser('bobfol@example.com', 'pass123', 'Bob');

        await request(app)
            .post(`/api/users/${bob.userId}/follow`)
            .set('Authorization', `Bearer ${alice.token}`);

        const res = await request(app)
            .get(`/api/users/${bob.userId}/followers`)
            .set('Authorization', `Bearer ${bob.token}`);

        expect(res.status).toBe(200);
        expect(res.body.followers).toHaveLength(1);
        expect(res.body.followers[0].id).toBe(alice.userId);
        expect(res.body.hasMore).toBe(false);
    });

    it('GET /api/me/feed returns pins from followed users', async () => {
        const alice = await createTestUser('alicefeed@example.com', 'pass123', 'Alice');
        const bob = await createTestUser('bobfeed@example.com', 'pass123', 'Bob');

        query(
            `INSERT INTO pin(creatorID, latitude, longitude, title, tags, likes) VALUES(?, 1.0, 1.0, 'Bob Pin', '[]', 0)`,
            [bob.userId]
        );

        await request(app)
            .post(`/api/users/${bob.userId}/follow`)
            .set('Authorization', `Bearer ${alice.token}`);

        const res = await request(app)
            .get('/api/me/feed')
            .set('Authorization', `Bearer ${alice.token}`);

        expect(res.status).toBe(200);
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].creatorID).toBe(bob.userId);
    });
});
