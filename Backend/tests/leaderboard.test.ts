/**
 * Carbon-savings leaderboard tests (Stage 4).
 * Covers ranking order, privacy exclusion (profileVisibility), exclusion of
 * users with no savings, and auth.
 */
import request from 'supertest';
import { createTestApp, createTestUser } from './helpers/testApp';

let app: any;

beforeAll(async () => {
    app = await createTestApp();
});

function saveTrip(token: string, bestCarbonKg: number, typicalKg: number) {
    return request(app)
        .post('/api/trip/save')
        .set('Authorization', `Bearer ${token}`)
        .send({
            itinerary: { summary: 'x' },
            itineraryType: 'Adventure',
            settings: { carbonStats: { bestOption: { carbonKg: bestCarbonKg }, typicalTouristKg: typicalKg } },
        });
}

function setVisibility(token: string, profileVisibility: string) {
    return request(app).patch('/api/me').set('Authorization', `Bearer ${token}`).send({ profileVisibility });
}

function getLeaderboard(token: string) {
    return request(app).get('/api/leaderboard').set('Authorization', `Bearer ${token}`);
}

describe('GET /api/leaderboard', () => {
    it('requires authentication', async () => {
        const res = await request(app).get('/api/leaderboard');
        expect(res.status).toBe(401);
    });

    it('ranks users by total carbon saved, descending', async () => {
        const viewer = await createTestUser('lb-viewer@example.com');
        const big = await createTestUser('lb-big@example.com');
        const small = await createTestUser('lb-small@example.com');
        await saveTrip(big.token, 50, 350);   // saved 300
        await saveTrip(small.token, 50, 150);  // saved 100

        const res = await getLeaderboard(viewer.token);
        expect(res.status).toBe(200);
        const ids = res.body.items.map((r: any) => r.accountID);
        expect(ids.indexOf(big.userId)).toBeLessThan(ids.indexOf(small.userId));
        expect(res.body.items[0]).toMatchObject({ rank: 1, accountID: big.userId, totalSavedKg: 300 });
    });

    it('excludes users with non-public profiles', async () => {
        const viewer = await createTestUser('lb-v2@example.com');
        const hidden = await createTestUser('lb-hidden@example.com');
        await saveTrip(hidden.token, 50, 500); // saved 450 (would top the board)
        await setVisibility(hidden.token, 'private');

        const res = await getLeaderboard(viewer.token);
        const ids = res.body.items.map((r: any) => r.accountID);
        expect(ids).not.toContain(hidden.userId);
    });

    it('excludes users with no carbon savings', async () => {
        const viewer = await createTestUser('lb-v3@example.com');
        const zero = await createTestUser('lb-zero@example.com');
        await saveTrip(zero.token, 200, 200); // saved 0

        const res = await getLeaderboard(viewer.token);
        const ids = res.body.items.map((r: any) => r.accountID);
        expect(ids).not.toContain(zero.userId);
    });
});
