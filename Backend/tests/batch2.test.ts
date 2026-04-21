/**
 * End-to-End Tests for Batch 2 features
 *
 * - Trending pin ordering (likes + recency score)
 * - Pin status endpoints (visited / wishlist) with auth + validation
 * - Search history retention cap + dedup
 */

import request from 'supertest';
import { createTestApp, createTestUser, createTestPin } from './helpers/testApp';
import { query } from '../database/db';

let app: any;

beforeAll(async () => {
    app = await createTestApp();
});

describe('GET /api/pins/trending', () => {
    let userToken: string;
    let userId: number;

    beforeEach(async () => {
        const u = await createTestUser('trend@example.com', 'password123', 'Trend User');
        userToken = u.token;
        userId = u.userId;
    });

    function setPinAge(pinId: number, daysAgo: number) {
        query(
            `UPDATE pin SET createdAt = datetime('now', ?) WHERE id = ?`,
            [`-${daysAgo} days`, pinId],
        );
    }

    function addLikes(pinId: number, count: number) {
        for (let i = 0; i < count; i++) {
            const email = `liker${pinId}_${i}@example.com`;
            query('INSERT INTO account (email, password, name) VALUES (?, ?, ?)', [email, 'hash', 'L']);
            const [{ id }] = query('SELECT last_insert_rowid() as id');
            query('INSERT INTO likes (pinID, accountID) VALUES (?, ?)', [pinId, id]);
        }
    }

    it('requires authentication', async () => {
        const res = await request(app).get('/api/pins/trending');
        expect(res.status).toBe(401);
    });

    it('orders by likes + recency score (recent pins outrank older pins with same likes)', async () => {
        const freshPin = createTestPin(userId, { title: 'Fresh' });
        const oldPin = createTestPin(userId, { title: 'Old' });

        setPinAge(freshPin, 0);
        setPinAge(oldPin, 6);

        addLikes(freshPin, 2);
        addLikes(oldPin, 2);

        const res = await request(app)
            .get('/api/pins/trending?days=7')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const titles = res.body.map((p: any) => p.title);
        expect(titles.indexOf('Fresh')).toBeLessThan(titles.indexOf('Old'));
    });

    it('excludes recency bonus for pins older than the window', async () => {
        const popularOld = createTestPin(userId, { title: 'PopularOld' });
        const freshQuiet = createTestPin(userId, { title: 'FreshQuiet' });

        setPinAge(popularOld, 30);
        setPinAge(freshQuiet, 0);

        addLikes(popularOld, 5);

        const res = await request(app)
            .get('/api/pins/trending?days=7')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        const titles = res.body.map((p: any) => p.title);
        expect(titles.indexOf('PopularOld')).toBeLessThan(titles.indexOf('FreshQuiet'));
    });

    it('caps results at 20', async () => {
        for (let i = 0; i < 25; i++) {
            createTestPin(userId, { title: `Pin${i}` });
        }
        const res = await request(app)
            .get('/api/pins/trending')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(200);
        expect(res.body.length).toBeLessThanOrEqual(20);
    });

    it('accepts days parameter at the upper boundary', async () => {
        createTestPin(userId);
        const res = await request(app)
            .get('/api/pins/trending?days=365')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(200);
    });

    it('rejects out-of-range days parameter via schema validation', async () => {
        const res = await request(app)
            .get('/api/pins/trending?days=9999')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(400);
    });
});

describe('Pin status endpoints', () => {
    let userToken: string;
    let userId: number;
    let otherToken: string;
    let otherId: number;
    let pinId: number;

    beforeEach(async () => {
        const u = await createTestUser('status@example.com', 'password123', 'Status User');
        userToken = u.token;
        userId = u.userId;
        const o = await createTestUser('other_status@example.com', 'password123', 'Other');
        otherToken = o.token;
        otherId = o.userId;
        pinId = createTestPin(userId);
    });

    describe('PUT /api/pins/:id/status', () => {
        it('requires authentication', async () => {
            const res = await request(app)
                .put(`/api/pins/${pinId}/status`)
                .send({ status: 'visited' });
            expect(res.status).toBe(401);
        });

        it('sets visited status', async () => {
            const res = await request(app)
                .put(`/api/pins/${pinId}/status`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ status: 'visited' });
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('visited');
        });

        it('sets wishlist status', async () => {
            const res = await request(app)
                .put(`/api/pins/${pinId}/status`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ status: 'wishlist' });
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('wishlist');
        });

        it('rejects invalid status values', async () => {
            const res = await request(app)
                .put(`/api/pins/${pinId}/status`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ status: 'bogus' });
            expect(res.status).toBe(400);
        });

        it('returns 404 for non-existent pin', async () => {
            const res = await request(app)
                .put(`/api/pins/999999/status`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ status: 'visited' });
            expect(res.status).toBe(404);
        });

        it('is idempotent: overwrites previous status', async () => {
            await request(app)
                .put(`/api/pins/${pinId}/status`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ status: 'wishlist' });
            const res = await request(app)
                .put(`/api/pins/${pinId}/status`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ status: 'visited' });
            expect(res.status).toBe(200);

            const rows = query(
                `SELECT status FROM pin_status WHERE pinID = ? AND accountID = ?`,
                [pinId, userId],
            );
            expect(rows.length).toBe(1);
            expect(rows[0].status).toBe('visited');
        });

        it('scopes status per user', async () => {
            await request(app)
                .put(`/api/pins/${pinId}/status`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ status: 'visited' });
            await request(app)
                .put(`/api/pins/${pinId}/status`)
                .set('Authorization', `Bearer ${otherToken}`)
                .send({ status: 'wishlist' });

            const rows = query(
                `SELECT accountID, status FROM pin_status WHERE pinID = ?`,
                [pinId],
            );
            expect(rows.length).toBe(2);
            const byUser = Object.fromEntries(rows.map((r: any) => [r.accountID, r.status]));
            expect(byUser[userId]).toBe('visited');
            expect(byUser[otherId]).toBe('wishlist');
        });
    });

    describe('DELETE /api/pins/:id/status', () => {
        it('requires authentication', async () => {
            const res = await request(app).delete(`/api/pins/${pinId}/status`);
            expect(res.status).toBe(401);
        });

        it('returns 404 when no status was set', async () => {
            const res = await request(app)
                .delete(`/api/pins/${pinId}/status`)
                .set('Authorization', `Bearer ${userToken}`);
            expect(res.status).toBe(404);
        });

        it('removes only the current user\'s status', async () => {
            await request(app)
                .put(`/api/pins/${pinId}/status`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ status: 'visited' });
            await request(app)
                .put(`/api/pins/${pinId}/status`)
                .set('Authorization', `Bearer ${otherToken}`)
                .send({ status: 'visited' });

            const res = await request(app)
                .delete(`/api/pins/${pinId}/status`)
                .set('Authorization', `Bearer ${userToken}`);
            expect(res.status).toBe(204);

            const rows = query(
                `SELECT accountID FROM pin_status WHERE pinID = ?`,
                [pinId],
            );
            expect(rows.length).toBe(1);
            expect(rows[0].accountID).toBe(otherId);
        });
    });

    describe('GET /api/pin-status', () => {
        it('returns only the current user\'s statuses', async () => {
            const pin2 = createTestPin(userId);
            await request(app)
                .put(`/api/pins/${pinId}/status`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ status: 'visited' });
            await request(app)
                .put(`/api/pins/${pin2}/status`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({ status: 'wishlist' });
            await request(app)
                .put(`/api/pins/${pinId}/status`)
                .set('Authorization', `Bearer ${otherToken}`)
                .send({ status: 'visited' });

            const res = await request(app)
                .get('/api/pin-status')
                .set('Authorization', `Bearer ${userToken}`);

            expect(res.status).toBe(200);
            expect(res.body.length).toBe(2);
            const map = Object.fromEntries(res.body.map((r: any) => [r.pinID, r.status]));
            expect(map[pinId]).toBe('visited');
            expect(map[pin2]).toBe('wishlist');
        });
    });
});

describe('Search history endpoints', () => {
    let userToken: string;
    let userId: number;
    let otherToken: string;

    beforeEach(async () => {
        const u = await createTestUser('search@example.com', 'password123', 'Search User');
        userToken = u.token;
        userId = u.userId;
        const o = await createTestUser('other_search@example.com', 'password123', 'Other');
        otherToken = o.token;
    });

    it('requires authentication', async () => {
        const res = await request(app).get('/api/search/history');
        expect(res.status).toBe(401);
    });

    it('records and retrieves history entries', async () => {
        await request(app)
            .post('/api/search/history')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ query: 'Paris' });

        const res = await request(app)
            .get('/api/search/history')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
        expect(res.body[0].query).toBe('Paris');
    });

    it('dedupes identical queries to a single fresh entry', async () => {
        await request(app)
            .post('/api/search/history')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ query: 'Tokyo' });
        await request(app)
            .post('/api/search/history')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ query: 'Tokyo' });

        const rows = query(
            `SELECT query FROM search_history WHERE accountID = ?`,
            [userId],
        );
        expect(rows.length).toBe(1);
    });

    it('caps stored history at 50 entries per user', async () => {
        for (let i = 0; i < 60; i++) {
            await request(app)
                .post('/api/search/history')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ query: `query-${i}` });
        }

        const rows = query(
            `SELECT COUNT(*) as count FROM search_history WHERE accountID = ?`,
            [userId],
        );
        expect(rows[0].count).toBe(50);

        // Oldest entries were evicted; the latest should still be present.
        const latest = query(
            `SELECT query FROM search_history WHERE accountID = ? ORDER BY id DESC LIMIT 1`,
            [userId],
        );
        expect(latest[0].query).toBe('query-59');
    });

    it('GET returns at most 10 most recent entries', async () => {
        for (let i = 0; i < 15; i++) {
            await request(app)
                .post('/api/search/history')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ query: `q-${i}` });
        }

        const res = await request(app)
            .get('/api/search/history')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(10);
        expect(res.body[0].query).toBe('q-14');
    });

    it('rejects empty or missing queries', async () => {
        const res1 = await request(app)
            .post('/api/search/history')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ query: '   ' });
        expect(res1.status).toBe(400);

        const res2 = await request(app)
            .post('/api/search/history')
            .set('Authorization', `Bearer ${userToken}`)
            .send({});
        expect(res2.status).toBe(400);
    });

    it('DELETE /:id removes only the current user\'s entry', async () => {
        const post = await request(app)
            .post('/api/search/history')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ query: 'London' });
        const entryId = post.body.id;

        const badDelete = await request(app)
            .delete(`/api/search/history/${entryId}`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(badDelete.status).toBe(404);

        const okDelete = await request(app)
            .delete(`/api/search/history/${entryId}`)
            .set('Authorization', `Bearer ${userToken}`);
        expect(okDelete.status).toBe(204);

        const res = await request(app)
            .get('/api/search/history')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.body.length).toBe(0);
    });

    it('scopes history per user', async () => {
        await request(app)
            .post('/api/search/history')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ query: 'alpha' });
        await request(app)
            .post('/api/search/history')
            .set('Authorization', `Bearer ${otherToken}`)
            .send({ query: 'beta' });

        const mine = await request(app)
            .get('/api/search/history')
            .set('Authorization', `Bearer ${userToken}`);
        expect(mine.body.length).toBe(1);
        expect(mine.body[0].query).toBe('alpha');
    });
});
