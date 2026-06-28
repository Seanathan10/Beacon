/**
 * Personal carbon dashboard aggregation tests (Stage 4).
 * Covers GET /api/me/carbon-stats: summation, savings %, monthly grouping,
 * owner isolation, and exclusion of trips without carbon data.
 */
import request from 'supertest';
import { createTestApp, createTestUser } from './helpers/testApp';

let app: any;

beforeAll(async () => {
    app = await createTestApp();
});

function saveTripWithCarbon(token: string, bestCarbonKg: number | null, typicalKg: number) {
    const settings: Record<string, any> = { origin: 'A', destination: 'B', durationDays: 3 };
    if (bestCarbonKg !== null) {
        settings.carbonStats = {
            bestOption: { mode: 'train', carbonKg: bestCarbonKg },
            typicalTouristKg: typicalKg,
        };
    }
    return request(app)
        .post('/api/trip/save')
        .set('Authorization', `Bearer ${token}`)
        .send({ itinerary: { summary: 'x' }, itineraryType: 'Adventure', settings });
}

function getStats(token: string) {
    return request(app).get('/api/me/carbon-stats').set('Authorization', `Bearer ${token}`);
}

describe('GET /api/me/carbon-stats', () => {
    it('requires authentication', async () => {
        const res = await request(app).get('/api/me/carbon-stats');
        expect(res.status).toBe(401);
    });

    it('returns zeros when the user has no trips with carbon data', async () => {
        const user = await createTestUser('carbon-empty@example.com');
        const res = await getStats(user.token);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            tripCount: 0,
            totalCarbonKg: 0,
            totalSavedKg: 0,
            avgSavingsPct: 0,
            byMonth: [],
        });
    });

    it('aggregates carbon and savings across trips', async () => {
        const user = await createTestUser('carbon-agg@example.com');
        await saveTripWithCarbon(user.token, 100, 300); // saved 200
        await saveTripWithCarbon(user.token, 50, 150);  // saved 100

        const res = await getStats(user.token);
        expect(res.body.tripCount).toBe(2);
        expect(res.body.totalCarbonKg).toBe(150);
        expect(res.body.totalSavedKg).toBe(300);
        // typical total = 150 + 300 = 450; saved share = 300/450 = 67%
        expect(res.body.avgSavingsPct).toBe(67);
        expect(res.body.offsetCostUsd).toBeCloseTo(2.25, 2);
        expect(res.body.byMonth).toHaveLength(1);
        expect(res.body.byMonth[0]).toMatchObject({ count: 2, carbonKg: 150, savedKg: 300 });
    });

    it('excludes trips that carry no carbon data', async () => {
        const user = await createTestUser('carbon-nodata@example.com');
        await saveTripWithCarbon(user.token, 80, 200); // counts
        await saveTripWithCarbon(user.token, null, 0);  // no carbonStats → excluded

        const res = await getStats(user.token);
        expect(res.body.tripCount).toBe(1);
        expect(res.body.totalCarbonKg).toBe(80);
        expect(res.body.totalSavedKg).toBe(120);
    });

    it('never counts another user\'s trips', async () => {
        const owner = await createTestUser('carbon-owner@example.com');
        const other = await createTestUser('carbon-other@example.com');
        await saveTripWithCarbon(owner.token, 100, 300);

        const res = await getStats(other.token);
        expect(res.body.tripCount).toBe(0);
        expect(res.body.totalSavedKg).toBe(0);
    });
});
