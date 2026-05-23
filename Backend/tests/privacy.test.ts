/**
 * Cross-endpoint privacy regression guard.
 *
 * Any new endpoint that returns user-linked data must be covered here.
 * A private user's data must not appear through any read path for a third party.
 */
import request from 'supertest';
import { createTestApp, createTestUser, createTestPin } from './helpers/testApp';
import { query } from '../database/db';

let app: any;

beforeAll(async () => {
    app = await createTestApp();
});

function makePrivate(userId: number) {
    query("UPDATE account SET profileVisibility = 'private' WHERE id = ?", [userId]);
}

describe('Private profile — direct profile access', () => {
    it('GET /api/users/:userID returns 403 for private profile (authenticated viewer)', async () => {
        const privateUser = await createTestUser('priv-profile@example.com', 'pass123', 'Private');
        const viewer = await createTestUser('viewer-profile@example.com', 'pass123', 'Viewer');
        makePrivate(privateUser.userId);

        const res = await request(app)
            .get(`/api/users/${privateUser.userId}`)
            .set('Authorization', `Bearer ${viewer.token}`);

        expect(res.status).toBe(403);
    });

    it('GET /api/users/:userID returns 403 for private profile (unauthenticated)', async () => {
        const privateUser = await createTestUser('priv-profile-anon@example.com', 'pass123', 'Private');
        makePrivate(privateUser.userId);

        const res = await request(app)
            .get(`/api/users/${privateUser.userId}`);

        expect(res.status).toBe(403);
    });

    it('GET /api/users/:userID owner can still access their own private profile', async () => {
        const privateUser = await createTestUser('priv-self@example.com', 'pass123', 'Private');
        makePrivate(privateUser.userId);

        const res = await request(app)
            .get(`/api/users/${privateUser.userId}`)
            .set('Authorization', `Bearer ${privateUser.token}`);

        expect(res.status).toBe(200);
    });
});

describe('Private profile — pins list', () => {
    it('GET /api/users/:userID/pins returns empty for private profile (authenticated viewer)', async () => {
        const privateUser = await createTestUser('priv-pins@example.com', 'pass123', 'Private');
        const viewer = await createTestUser('viewer-pins@example.com', 'pass123', 'Viewer');
        createTestPin(privateUser.userId, { title: 'Secret Pin' });
        makePrivate(privateUser.userId);

        const res = await request(app)
            .get(`/api/users/${privateUser.userId}/pins`)
            .set('Authorization', `Bearer ${viewer.token}`);

        expect(res.status).toBe(200);
        expect(res.body.pins).toHaveLength(0);
    });

    it('GET /api/users/:userID/pins returns empty for private profile (unauthenticated)', async () => {
        const privateUser = await createTestUser('priv-pins-anon@example.com', 'pass123', 'Private');
        createTestPin(privateUser.userId, { title: 'Secret Pin' });
        makePrivate(privateUser.userId);

        const res = await request(app)
            .get(`/api/users/${privateUser.userId}/pins`);

        expect(res.status).toBe(200);
        expect(res.body.pins).toHaveLength(0);
    });

    it('GET /api/users/:userID/pins returns pins for own private profile', async () => {
        const privateUser = await createTestUser('priv-pins-self@example.com', 'pass123', 'Private');
        createTestPin(privateUser.userId, { title: 'My Secret Pin' });
        makePrivate(privateUser.userId);

        const res = await request(app)
            .get(`/api/users/${privateUser.userId}/pins`)
            .set('Authorization', `Bearer ${privateUser.token}`);

        expect(res.status).toBe(200);
        expect(res.body.pins).toHaveLength(1);
    });
});

describe('Private profile — followers list', () => {
    it('GET /api/users/:userID/followers returns 403 for private profile (authenticated viewer)', async () => {
        const privateUser = await createTestUser('priv-fol@example.com', 'pass123', 'Private');
        const follower = await createTestUser('follower-fol@example.com', 'pass123', 'Follower');
        const viewer = await createTestUser('viewer-fol@example.com', 'pass123', 'Viewer');
        query('INSERT INTO user_follow (followerID, followingID) VALUES (?, ?)', [follower.userId, privateUser.userId]);
        makePrivate(privateUser.userId);

        const res = await request(app)
            .get(`/api/users/${privateUser.userId}/followers`)
            .set('Authorization', `Bearer ${viewer.token}`);

        expect(res.status).toBe(403);
    });

    it('GET /api/users/:userID/followers returns 403 for private profile (unauthenticated)', async () => {
        const privateUser = await createTestUser('priv-fol-anon@example.com', 'pass123', 'Private');
        makePrivate(privateUser.userId);

        const res = await request(app)
            .get(`/api/users/${privateUser.userId}/followers`);

        expect(res.status).toBe(403);
    });

    it('GET /api/users/:userID/followers owner can see their own private followers', async () => {
        const privateUser = await createTestUser('priv-fol-self@example.com', 'pass123', 'Private');
        const follower = await createTestUser('follower-fol-self@example.com', 'pass123', 'Follower');
        query('INSERT INTO user_follow (followerID, followingID) VALUES (?, ?)', [follower.userId, privateUser.userId]);
        makePrivate(privateUser.userId);

        const res = await request(app)
            .get(`/api/users/${privateUser.userId}/followers`)
            .set('Authorization', `Bearer ${privateUser.token}`);

        expect(res.status).toBe(200);
        expect(res.body.followers).toHaveLength(1);
    });
});

describe('Private profile — following list', () => {
    it('GET /api/users/:userID/following returns 403 for private profile (authenticated viewer)', async () => {
        const privateUser = await createTestUser('priv-fing@example.com', 'pass123', 'Private');
        const followed = await createTestUser('followed-fing@example.com', 'pass123', 'Followed');
        const viewer = await createTestUser('viewer-fing@example.com', 'pass123', 'Viewer');
        query('INSERT INTO user_follow (followerID, followingID) VALUES (?, ?)', [privateUser.userId, followed.userId]);
        makePrivate(privateUser.userId);

        const res = await request(app)
            .get(`/api/users/${privateUser.userId}/following`)
            .set('Authorization', `Bearer ${viewer.token}`);

        expect(res.status).toBe(403);
    });

    it('GET /api/users/:userID/following returns 403 for private profile (unauthenticated)', async () => {
        const privateUser = await createTestUser('priv-fing-anon@example.com', 'pass123', 'Private');
        makePrivate(privateUser.userId);

        const res = await request(app)
            .get(`/api/users/${privateUser.userId}/following`);

        expect(res.status).toBe(403);
    });

    it('GET /api/users/:userID/following owner can see their own private following list', async () => {
        const privateUser = await createTestUser('priv-fing-self@example.com', 'pass123', 'Private');
        const followed = await createTestUser('followed-fing-self@example.com', 'pass123', 'Followed');
        query('INSERT INTO user_follow (followerID, followingID) VALUES (?, ?)', [privateUser.userId, followed.userId]);
        makePrivate(privateUser.userId);

        const res = await request(app)
            .get(`/api/users/${privateUser.userId}/following`)
            .set('Authorization', `Bearer ${privateUser.token}`);

        expect(res.status).toBe(200);
        expect(res.body.following).toHaveLength(1);
    });
});

describe('Private profile — similar pins', () => {
    it('GET /api/pins/:id/similar does not expose pins from private creators', async () => {
        const publicUser = await createTestUser('pub-sim@example.com', 'pass123', 'Public');
        const privateUser = await createTestUser('priv-sim@example.com', 'pass123', 'Private');
        const liker = await createTestUser('liker-sim@example.com', 'pass123', 'Liker');

        // publicUser creates a pin that liker likes
        const publicPinId = createTestPin(publicUser.userId, { title: 'Public anchor pin' });
        // privateUser creates a pin that liker also likes
        const privatePinId = createTestPin(privateUser.userId, { title: 'Private secret pin' });

        // liker likes both pins — making privateUser's pin appear as "similar" to publicUser's pin
        query('INSERT INTO likes (pinID, accountID) VALUES (?, ?)', [publicPinId, liker.userId]);
        query('INSERT INTO likes (pinID, accountID) VALUES (?, ?)', [privatePinId, liker.userId]);

        makePrivate(privateUser.userId);

        const viewer = await createTestUser('viewer-sim@example.com', 'pass123', 'Viewer');
        const res = await request(app)
            .get(`/api/pins/${publicPinId}/similar`)
            .set('Authorization', `Bearer ${viewer.token}`);

        expect(res.status).toBe(200);
        const returnedIds = res.body.map((p: any) => p.id);
        expect(returnedIds).not.toContain(privatePinId);
    });
});

describe('Feed — does not surface private user pins to non-followers', () => {
    it('GET /api/me/feed omits pins from private users the viewer does not follow', async () => {
        const viewer = await createTestUser('viewer-feed@example.com', 'pass123', 'Viewer');
        const privateUser = await createTestUser('priv-feed@example.com', 'pass123', 'Private');

        // viewer follows privateUser, then privateUser goes private
        // this checks a subtle case: feed should still work when user is followed before going private
        // (debatable policy, but the data itself isn't a privacy violation — viewer chose to follow)
        // So this test checks the non-follow case: viewer does NOT follow privateUser
        createTestPin(privateUser.userId, { title: 'Private Pin Not In Feed' });
        makePrivate(privateUser.userId);

        const res = await request(app)
            .get('/api/me/feed')
            .set('Authorization', `Bearer ${viewer.token}`);

        expect(res.status).toBe(200);
        // viewer never followed privateUser so their pin must not appear
        const creatorIds = res.body.items.map((p: any) => p.creatorID);
        expect(creatorIds).not.toContain(privateUser.userId);
    });
});
