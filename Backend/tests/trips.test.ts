/**
 * My Trips / saved-draft tests (Stage 3).
 *
 * Covers POST /api/trip/save (create + update drafts), GET /api/me/trips
 * (list + pagination + owner isolation), GET /api/me/trips/:id (owner-only
 * full fetch), and the immutability boundary between private drafts and
 * published (shared) snapshots.
 */
import request from 'supertest';
import { createTestApp, createTestUser } from './helpers/testApp';

let app: any;

beforeAll(async () => {
    app = await createTestApp();
});

const sampleItinerary = {
    summary: 'A lovely sustainable trip',
    days: [{ day: 1, title: 'Arrival', activities: ['Walk the old town'] }],
};

function savePayload(overrides: Record<string, any> = {}) {
    return {
        itinerary: sampleItinerary,
        itineraryType: 'Adventure',
        settings: { origin: 'Paris', destination: 'Lyon', durationDays: 3 },
        ...overrides,
    };
}

function saveTrip(token: string, body: Record<string, any>) {
    return request(app)
        .post('/api/trip/save')
        .set('Authorization', `Bearer ${token}`)
        .send(body);
}

function listTrips(token: string, cursor?: number) {
    const url = cursor ? `/api/me/trips?cursor=${cursor}` : '/api/me/trips';
    return request(app).get(url).set('Authorization', `Bearer ${token}`);
}

function publishShare(token: string, body: Record<string, any>) {
    return request(app)
        .post('/api/share')
        .set('Authorization', `Bearer ${token}`)
        .send(body);
}

describe('POST /api/trip/save', () => {
    it('creates a private draft and returns its id', async () => {
        const user = await createTestUser('trip-save-create@example.com');
        const res = await saveTrip(user.token, savePayload({ title: 'Weekend in Lyon' }));

        expect(res.status).toBe(201);
        expect(typeof res.body.id).toBe('string');
        expect(res.body.isPublic).toBe(false);
    });

    it('requires authentication', async () => {
        const res = await request(app).post('/api/trip/save').send(savePayload());
        expect(res.status).toBe(401);
    });

    it('rejects a payload missing the itinerary', async () => {
        const user = await createTestUser('trip-save-missing@example.com');
        const res = await saveTrip(user.token, { itineraryType: 'Adventure' });
        expect(res.status).toBe(400);
    });

    it('updates an existing draft in place', async () => {
        const user = await createTestUser('trip-save-update@example.com');
        const created = await saveTrip(user.token, savePayload({ title: 'Original' }));
        const id = created.body.id;

        const updated = await saveTrip(user.token, savePayload({ id, title: 'Renamed' }));
        expect(updated.status).toBe(200);
        expect(updated.body.id).toBe(id);

        const fetched = await request(app)
            .get(`/api/me/trips/${id}`)
            .set('Authorization', `Bearer ${user.token}`);
        expect(fetched.body.title).toBe('Renamed');

        // Still exactly one trip — an update must not insert a new row.
        const list = await listTrips(user.token);
        expect(list.body.items).toHaveLength(1);
    });

    it('returns 404 when updating a draft the user does not own', async () => {
        const owner = await createTestUser('trip-save-owner@example.com');
        const attacker = await createTestUser('trip-save-attacker@example.com');
        const created = await saveTrip(owner.token, savePayload());

        const res = await saveTrip(attacker.token, savePayload({ id: created.body.id }));
        expect(res.status).toBe(404);
    });

    it('refuses to overwrite a published (shared) snapshot', async () => {
        const user = await createTestUser('trip-save-immutable@example.com');
        const shared = await publishShare(user.token, savePayload({ title: 'Published' }));
        expect(shared.status).toBe(201);

        const res = await saveTrip(user.token, savePayload({ id: shared.body.id }));
        expect(res.status).toBe(409);
    });
});

describe('GET /api/me/trips', () => {
    it('lists the user\'s own drafts and published trips, newest first', async () => {
        const user = await createTestUser('trip-list-basic@example.com');
        await saveTrip(user.token, savePayload({ title: 'First' }));
        await saveTrip(user.token, savePayload({ title: 'Second' }));
        await publishShare(user.token, savePayload({ title: 'Third (shared)' }));

        const res = await listTrips(user.token);
        expect(res.status).toBe(200);
        expect(res.body.items).toHaveLength(3);
        expect(res.body.items[0].title).toBe('Third (shared)');
        expect(res.body.items[0].isPublic).toBe(true);
        expect(res.body.items[2].title).toBe('First');
        expect(res.body.items[0].summary).toMatchObject({
            origin: 'Paris',
            destination: 'Lyon',
            itineraryType: 'Adventure',
            durationDays: 3,
        });
    });

    it('never returns another user\'s trips', async () => {
        const owner = await createTestUser('trip-list-owner@example.com');
        const other = await createTestUser('trip-list-other@example.com');
        await saveTrip(owner.token, savePayload());

        const res = await listTrips(other.token);
        expect(res.body.items).toHaveLength(0);
    });

    it('rejects an invalid cursor', async () => {
        const user = await createTestUser('trip-list-cursor@example.com');
        const res = await listTrips(user.token, -5 as unknown as number);
        expect(res.status).toBe(400);
    });

    it('paginates with a stable cursor', async () => {
        const user = await createTestUser('trip-list-page@example.com');
        for (let i = 0; i < 21; i++) {
            await saveTrip(user.token, savePayload({ title: `Trip ${i}` }));
        }

        const first = await listTrips(user.token);
        expect(first.body.items).toHaveLength(20);
        expect(first.body.hasMore).toBe(true);
        expect(first.body.nextCursor).toBeGreaterThan(0);

        const second = await listTrips(user.token, first.body.nextCursor);
        expect(second.body.items).toHaveLength(1);
        expect(second.body.hasMore).toBe(false);
        expect(second.body.nextCursor).toBeNull();
    });
});

describe('GET /api/me/trips/:id', () => {
    it('returns the full itinerary payload to the owner', async () => {
        const user = await createTestUser('trip-get-owner@example.com');
        const created = await saveTrip(user.token, savePayload({ title: 'Detailed' }));

        const res = await request(app)
            .get(`/api/me/trips/${created.body.id}`)
            .set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Detailed');
        expect(res.body.isPublic).toBe(false);
        expect(res.body.itinerary).toMatchObject({ summary: 'A lovely sustainable trip' });
        expect(res.body.itineraryType).toBe('Adventure');
    });

    it('returns 404 for a trip owned by someone else', async () => {
        const owner = await createTestUser('trip-get-owner2@example.com');
        const other = await createTestUser('trip-get-other@example.com');
        const created = await saveTrip(owner.token, savePayload());

        const res = await request(app)
            .get(`/api/me/trips/${created.body.id}`)
            .set('Authorization', `Bearer ${other.token}`);
        expect(res.status).toBe(404);
    });

    it('returns 404 for an unknown id', async () => {
        const user = await createTestUser('trip-get-unknown@example.com');
        const res = await request(app)
            .get('/api/me/trips/does-not-exist')
            .set('Authorization', `Bearer ${user.token}`);
        expect(res.status).toBe(404);
    });
});

describe('Draft privacy vs published snapshots', () => {
    it('does not expose a private draft through the public share link', async () => {
        const user = await createTestUser('trip-privacy-draft@example.com');
        const created = await saveTrip(user.token, savePayload());

        const res = await request(app).get(`/api/share/${created.body.id}`);
        expect(res.status).toBe(404);
    });

    it('exposes a published snapshot through the public share link', async () => {
        const user = await createTestUser('trip-privacy-shared@example.com');
        const shared = await publishShare(user.token, savePayload());

        const res = await request(app).get(`/api/share/${shared.body.id}`);
        expect(res.status).toBe(200);
    });
});
