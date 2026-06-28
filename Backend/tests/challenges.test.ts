/**
 * Eco-challenge progression tests (Stage 4).
 * Covers GET /api/me/challenges, progress accrual from saving trips and visiting
 * places, completion notifications, and anti-double-counting safeguards.
 */
import request from 'supertest';
import { createTestApp, createTestUser, createTestPin } from './helpers/testApp';

let app: any;

beforeAll(async () => {
    app = await createTestApp();
});

function listChallenges(token: string) {
    return request(app).get('/api/me/challenges').set('Authorization', `Bearer ${token}`);
}

function byCode(items: any[], code: string) {
    return items.find((c) => c.code === code);
}

function saveTrip(token: string, bestCarbonKg: number, typicalKg: number) {
    return request(app)
        .post('/api/trip/save')
        .set('Authorization', `Bearer ${token}`)
        .send({
            itinerary: { summary: 'x' },
            itineraryType: 'Adventure',
            settings: {
                origin: 'A', destination: 'B', durationDays: 2,
                carbonStats: { bestOption: { mode: 'train', carbonKg: bestCarbonKg }, typicalTouristKg: typicalKg },
            },
        });
}

function setVisited(token: string, pinId: number, status = 'visited') {
    return request(app)
        .put(`/api/pins/${pinId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status });
}

describe('GET /api/me/challenges', () => {
    it('requires authentication', async () => {
        const res = await request(app).get('/api/me/challenges');
        expect(res.status).toBe(401);
    });

    it('lists seeded challenges with zero progress for a new user', async () => {
        const user = await createTestUser('chal-new@example.com');
        const res = await listChallenges(user.token);
        expect(res.status).toBe(200);
        expect(res.body.items.length).toBeGreaterThanOrEqual(4);
        const eco = byCode(res.body.items, 'eco_explorer');
        expect(eco).toMatchObject({ metric: 'trips_saved', goal: 5, progress: 0, completed: false });
    });
});

describe('Challenge progression', () => {
    it('advances trips_saved and carbon_saved when a trip is saved', async () => {
        const user = await createTestUser('chal-save@example.com');
        await saveTrip(user.token, 50, 90); // saved 40

        const items = (await listChallenges(user.token)).body.items;
        expect(byCode(items, 'eco_explorer').progress).toBe(1);
        expect(byCode(items, 'carbon_saver').progress).toBe(40);
    });

    it('does not advance trips_saved when updating an existing draft', async () => {
        const user = await createTestUser('chal-update@example.com');
        const created = await saveTrip(user.token, 50, 90);
        await request(app)
            .post('/api/trip/save')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ id: created.body.id, itinerary: { summary: 'y' }, itineraryType: 'Adventure',
                    settings: { carbonStats: { bestOption: { carbonKg: 50 }, typicalTouristKg: 90 } } });

        const items = (await listChallenges(user.token)).body.items;
        expect(byCode(items, 'eco_explorer').progress).toBe(1);
    });

    it('completes a challenge and sends a notification when the goal is reached', async () => {
        const user = await createTestUser('chal-complete@example.com');
        await saveTrip(user.token, 50, 200); // saved 150 >= carbon_saver goal 100

        const items = (await listChallenges(user.token)).body.items;
        const saver = byCode(items, 'carbon_saver');
        expect(saver.completed).toBe(true);
        expect(saver.completedAt).not.toBeNull();

        const notifs = await request(app).get('/api/notifications').set('Authorization', `Bearer ${user.token}`);
        const complete = notifs.body.items.find((n: any) => n.type === 'challenge_complete');
        expect(complete).toBeTruthy();
        expect(complete).toMatchObject({ entityType: 'challenge', actorID: null });
    });

    it('advances places_visited once per pin, ignoring repeats', async () => {
        const user = await createTestUser('chal-visit@example.com');
        const pin1 = createTestPin(user.userId, { title: 'P1' });
        const pin2 = createTestPin(user.userId, { title: 'P2' });

        await setVisited(user.token, pin1);
        await setVisited(user.token, pin1); // repeat — must not double count
        await setVisited(user.token, pin2);

        const items = (await listChallenges(user.token)).body.items;
        expect(byCode(items, 'local_legend').progress).toBe(2);
    });

    it('keeps each user\'s progress isolated', async () => {
        const a = await createTestUser('chal-iso-a@example.com');
        const b = await createTestUser('chal-iso-b@example.com');
        await saveTrip(a.token, 50, 90);

        const items = (await listChallenges(b.token)).body.items;
        expect(byCode(items, 'eco_explorer').progress).toBe(0);
    });
});
