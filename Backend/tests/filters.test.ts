/**
 * Tests for Batch 2 — Advanced Pin Filtering (GET /api/pins)
 *
 * Covers: tags (OR), dates, minRating/maxRating, bookmarkStatus, creatorID,
 * multi-filter AND logic, invalid input graceful handling, and auth guards.
 */
import request from 'supertest';
import { createTestApp, createTestUser, createTestPin } from './helpers/testApp';
import { query } from '../database/db';

let app: any;

beforeAll(async () => {
    app = await createTestApp();
});

function addLikes(pinId: number, count: number) {
    for (let i = 0; i < count; i++) {
        const email = `like_${pinId}_${i}_${Date.now()}_${Math.random()}@example.com`;
        query('INSERT INTO account (email, password, name) VALUES (?, ?, ?)', [email, 'hash', 'Liker']);
        const [{ id }] = query('SELECT last_insert_rowid() as id');
        query('INSERT INTO likes (pinID, accountID) VALUES (?, ?)', [pinId, id]);
    }
}

describe('GET /api/pins — tag filter', () => {
    it('returns only pins matching a single tag (OR logic)', async () => {
        const user = await createTestUser('tags1@example.com', 'pass123', 'Tagger');

        createTestPin(user.userId, { tags: JSON.stringify(['Scenic', 'Hot']), title: 'Pin A' });
        createTestPin(user.userId, { tags: JSON.stringify(['Eatery']), title: 'Pin B' });
        createTestPin(user.userId, { tags: JSON.stringify(['Local']), title: 'Pin C' });

        const res = await request(app)
            .get('/api/pins?tags=Scenic')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        const titles = res.body.map((p: any) => p.title);
        expect(titles).toContain('Pin A');
        expect(titles).not.toContain('Pin B');
        expect(titles).not.toContain('Pin C');
    });

    it('returns pins matching any of multiple tags (OR logic across tags)', async () => {
        const user = await createTestUser('tags2@example.com', 'pass123', 'Tagger2');

        createTestPin(user.userId, { tags: JSON.stringify(['Scenic']), title: 'Scenic Pin' });
        createTestPin(user.userId, { tags: JSON.stringify(['Eatery']), title: 'Eatery Pin' });
        createTestPin(user.userId, { tags: JSON.stringify(['Local']), title: 'Local Only Pin' });

        // Use repeated params (?tags=X&tags=Y) — the OpenAPI spec declares tags as an array
        const res = await request(app)
            .get('/api/pins?tags=Scenic&tags=Eatery')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        const titles = res.body.map((p: any) => p.title);
        expect(titles).toContain('Scenic Pin');
        expect(titles).toContain('Eatery Pin');
        expect(titles).not.toContain('Local Only Pin');
    });

    it('returns empty when no pins match the tag', async () => {
        const user = await createTestUser('tags3@example.com', 'pass123', 'Tagger3');
        createTestPin(user.userId, { tags: JSON.stringify(['Local']), title: 'Local Pin' });

        const res = await request(app)
            .get('/api/pins?tags=Scenic')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        const titles = res.body.map((p: any) => p.title);
        expect(titles).not.toContain('Local Pin');
    });
});

describe('GET /api/pins — date filter', () => {
    it('returns only pins on or after minDate', async () => {
        const user = await createTestUser('date1@example.com', 'pass123', 'Dater');

        const recentPin = createTestPin(user.userId, { title: 'Recent Pin' });
        const oldPin = createTestPin(user.userId, { title: 'Old Pin' });

        query("UPDATE pin SET createdAt = '2025-06-01 12:00:00' WHERE id = ?", [recentPin]);
        query("UPDATE pin SET createdAt = '2024-01-01 12:00:00' WHERE id = ?", [oldPin]);

        const res = await request(app)
            .get('/api/pins?minDate=2025-01-01')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        const titles = res.body.map((p: any) => p.title);
        expect(titles).toContain('Recent Pin');
        expect(titles).not.toContain('Old Pin');
    });

    it('returns only pins on or before maxDate', async () => {
        const user = await createTestUser('date2@example.com', 'pass123', 'Dater2');

        const recentPin = createTestPin(user.userId, { title: 'NewPin' });
        const oldPin = createTestPin(user.userId, { title: 'OldPin' });

        query("UPDATE pin SET createdAt = '2025-06-01 12:00:00' WHERE id = ?", [recentPin]);
        query("UPDATE pin SET createdAt = '2023-06-01 12:00:00' WHERE id = ?", [oldPin]);

        const res = await request(app)
            .get('/api/pins?maxDate=2024-01-01')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        const titles = res.body.map((p: any) => p.title);
        expect(titles).not.toContain('NewPin');
        expect(titles).toContain('OldPin');
    });

    it('returns 400 for malformed date values (graceful rejection, no crash)', async () => {
        const user = await createTestUser('date3@example.com', 'pass123', 'Dater3');
        createTestPin(user.userId, { title: 'Any Pin' });

        const res = await request(app)
            .get('/api/pins?minDate=not-a-date&maxDate=also-bad')
            .set('Authorization', `Bearer ${user.token}`);

        // The OpenAPI validator enforces YYYY-MM-DD pattern and rejects invalid values with 400
        expect(res.status).toBe(400);
    });
});

describe('GET /api/pins — rating (likes) filter', () => {
    it('returns only pins with at least minRating likes', async () => {
        const user = await createTestUser('rating1@example.com', 'pass123', 'Rater');

        const popularPin = createTestPin(user.userId, { title: 'Popular Pin' });
        createTestPin(user.userId, { title: 'Quiet Pin' });

        addLikes(popularPin, 5);

        const res = await request(app)
            .get('/api/pins?minRating=3')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        const titles = res.body.map((p: any) => p.title);
        expect(titles).toContain('Popular Pin');
        expect(titles).not.toContain('Quiet Pin');
    });

    it('returns only pins with at most maxRating likes', async () => {
        const user = await createTestUser('rating2@example.com', 'pass123', 'Rater2');

        const popularPin = createTestPin(user.userId, { title: 'Very Popular' });
        const quietPin = createTestPin(user.userId, { title: 'Less Popular' });

        addLikes(popularPin, 10);
        addLikes(quietPin, 2);

        const res = await request(app)
            .get('/api/pins?maxRating=5')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        const titles = res.body.map((p: any) => p.title);
        expect(titles).not.toContain('Very Popular');
        expect(titles).toContain('Less Popular');
    });

    it('handles minRating and maxRating together', async () => {
        const user = await createTestUser('rating3@example.com', 'pass123', 'Rater3');

        createTestPin(user.userId, { title: 'Low Likes' });
        const midPin = createTestPin(user.userId, { title: 'Mid Likes' });
        const highPin = createTestPin(user.userId, { title: 'High Likes' });

        addLikes(midPin, 5);
        addLikes(highPin, 20);

        const res = await request(app)
            .get('/api/pins?minRating=3&maxRating=10')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        const titles = res.body.map((p: any) => p.title);
        expect(titles).not.toContain('Low Likes');
        expect(titles).toContain('Mid Likes');
        expect(titles).not.toContain('High Likes');
    });
});

describe('GET /api/pins — bookmarkStatus filter', () => {
    it('returns only bookmarked pins for bookmarkStatus=bookmarked', async () => {
        const user = await createTestUser('bm1@example.com', 'pass123', 'Bookmarker');

        const bookmarkedPin = createTestPin(user.userId, { title: 'Bookmarked Pin' });
        createTestPin(user.userId, { title: 'Plain Pin' });

        query('INSERT INTO bookmark (pinID, accountID) VALUES (?, ?)', [bookmarkedPin, user.userId]);

        const res = await request(app)
            .get('/api/pins?bookmarkStatus=bookmarked')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        const titles = res.body.map((p: any) => p.title);
        expect(titles).toContain('Bookmarked Pin');
        expect(titles).not.toContain('Plain Pin');
    });

    it('returns only visited pins for bookmarkStatus=visited', async () => {
        const user = await createTestUser('bm2@example.com', 'pass123', 'Visitor');

        const visitedPin = createTestPin(user.userId, { title: 'Visited Pin' });
        createTestPin(user.userId, { title: 'Unvisited Pin' });

        query(
            "INSERT INTO pin_status (pinID, accountID, status) VALUES (?, ?, 'visited')",
            [visitedPin, user.userId]
        );

        const res = await request(app)
            .get('/api/pins?bookmarkStatus=visited')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        const titles = res.body.map((p: any) => p.title);
        expect(titles).toContain('Visited Pin');
        expect(titles).not.toContain('Unvisited Pin');
    });

    it('returns only wishlist pins for bookmarkStatus=wishlist', async () => {
        const user = await createTestUser('bm3@example.com', 'pass123', 'Wisher');

        const wishPin = createTestPin(user.userId, { title: 'Wishlist Pin' });
        createTestPin(user.userId, { title: 'No Status Pin' });

        query(
            "INSERT INTO pin_status (pinID, accountID, status) VALUES (?, ?, 'wishlist')",
            [wishPin, user.userId]
        );

        const res = await request(app)
            .get('/api/pins?bookmarkStatus=wishlist')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        const titles = res.body.map((p: any) => p.title);
        expect(titles).toContain('Wishlist Pin');
        expect(titles).not.toContain('No Status Pin');
    });

    it('returns 401 when bookmarkStatus is used without authentication', async () => {
        const res = await request(app)
            .get('/api/pins?bookmarkStatus=bookmarked');

        expect(res.status).toBe(401);
    });
});

describe('GET /api/pins — creatorID filter', () => {
    it('returns only pins from the specified creator', async () => {
        const alice = await createTestUser('creator-a@example.com', 'pass123', 'Alice');
        const bob = await createTestUser('creator-b@example.com', 'pass123', 'Bob');

        createTestPin(alice.userId, { title: 'Alice Pin' });
        createTestPin(bob.userId, { title: 'Bob Pin' });

        const res = await request(app)
            .get(`/api/pins?creatorID=${alice.userId}`)
            .set('Authorization', `Bearer ${alice.token}`);

        expect(res.status).toBe(200);
        const titles = res.body.map((p: any) => p.title);
        expect(titles).toContain('Alice Pin');
        expect(titles).not.toContain('Bob Pin');
    });
});

describe('GET /api/pins — multi-filter AND logic', () => {
    it('applies tags AND minDate together', async () => {
        const user = await createTestUser('multi1@example.com', 'pass123', 'Multi');

        const matchPin = createTestPin(user.userId, { tags: JSON.stringify(['Scenic']), title: 'Match' });
        const wrongTagPin = createTestPin(user.userId, { tags: JSON.stringify(['Eatery']), title: 'Wrong Tag' });
        const wrongDatePin = createTestPin(user.userId, { tags: JSON.stringify(['Scenic']), title: 'Too Old' });

        query("UPDATE pin SET createdAt = '2025-06-01' WHERE id = ?", [matchPin]);
        query("UPDATE pin SET createdAt = '2025-06-01' WHERE id = ?", [wrongTagPin]);
        query("UPDATE pin SET createdAt = '2020-01-01' WHERE id = ?", [wrongDatePin]);

        const res = await request(app)
            .get('/api/pins?tags=Scenic&minDate=2024-01-01')   // single tag + date (both must match)
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.status).toBe(200);
        const titles = res.body.map((p: any) => p.title);
        expect(titles).toContain('Match');
        expect(titles).not.toContain('Wrong Tag');
        expect(titles).not.toContain('Too Old');
    });
});
