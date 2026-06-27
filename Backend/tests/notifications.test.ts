/**
 * Notification system tests.
 *
 * Covers emission from social actions (like, follow, comment, upvote),
 * the no-self-notify rule, mark-read, unread-count, and pagination.
 */
import request from 'supertest';
import { createTestApp, createTestUser, createTestPin, createTestPost } from './helpers/testApp';

let app: any;

beforeAll(async () => {
    app = await createTestApp();
});

async function listNotifications(token: string, cursor?: number) {
    const url = cursor ? `/api/notifications?cursor=${cursor}` : '/api/notifications';
    return request(app).get(url).set('Authorization', `Bearer ${token}`);
}

describe('Notification emission', () => {
    it('notifies the pin creator when another user likes their pin', async () => {
        const owner = await createTestUser('notif-like-owner@example.com', 'pass123', 'Owner');
        const liker = await createTestUser('notif-like-actor@example.com', 'pass123', 'Liker');
        const pinId = createTestPin(owner.userId, { title: 'Likeable' });

        await request(app).post(`/api/likes/${pinId}`).set('Authorization', `Bearer ${liker.token}`);

        const res = await listNotifications(owner.token);
        expect(res.status).toBe(200);
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0]).toMatchObject({
            type: 'pin_like',
            entityType: 'pin',
            entityID: pinId,
            actorID: liker.userId,
            isRead: false,
        });
    });

    it('notifies the followed user when someone follows them', async () => {
        const followed = await createTestUser('notif-follow-target@example.com', 'pass123', 'Target');
        const follower = await createTestUser('notif-follow-actor@example.com', 'pass123', 'Follower');

        await request(app).post(`/api/users/${followed.userId}/follow`).set('Authorization', `Bearer ${follower.token}`);

        const res = await listNotifications(followed.token);
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0]).toMatchObject({ type: 'follow', actorID: follower.userId });
    });

    it('notifies the pin creator when another user comments', async () => {
        const owner = await createTestUser('notif-comment-owner@example.com', 'pass123', 'Owner');
        const commenter = await createTestUser('notif-comment-actor@example.com', 'pass123', 'Commenter');
        const pinId = createTestPin(owner.userId, { title: 'Commentable' });

        await request(app)
            .post(`/api/pins/${pinId}/comments`)
            .set('Authorization', `Bearer ${commenter.token}`)
            .send({ comment: 'Nice spot!' });

        const res = await listNotifications(owner.token);
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0]).toMatchObject({ type: 'pin_comment', entityID: pinId });
    });

    it('notifies the post creator when another user upvotes', async () => {
        const owner = await createTestUser('notif-upvote-owner@example.com', 'pass123', 'Owner');
        const voter = await createTestUser('notif-upvote-actor@example.com', 'pass123', 'Voter');
        const postId = createTestPost(owner.userId, { title: 'Upvotable' });

        await request(app).post(`/api/posts/${postId}/upvote`).set('Authorization', `Bearer ${voter.token}`);

        const res = await listNotifications(owner.token);
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0]).toMatchObject({ type: 'post_upvote', entityType: 'post', entityID: postId });
    });

    it('does NOT notify on self-actions (liking your own pin)', async () => {
        const owner = await createTestUser('notif-self@example.com', 'pass123', 'Owner');
        const pinId = createTestPin(owner.userId, { title: 'My own pin' });

        await request(app).post(`/api/likes/${pinId}`).set('Authorization', `Bearer ${owner.token}`);

        const res = await listNotifications(owner.token);
        expect(res.body.items).toHaveLength(0);
    });
});

describe('Notification read state', () => {
    it('unread-count reflects unread notifications and resets after mark-all-read', async () => {
        const owner = await createTestUser('notif-count-owner@example.com', 'pass123', 'Owner');
        const a = await createTestUser('notif-count-a@example.com', 'pass123', 'A');
        const b = await createTestUser('notif-count-b@example.com', 'pass123', 'B');
        const pinId = createTestPin(owner.userId, { title: 'Counted' });

        await request(app).post(`/api/likes/${pinId}`).set('Authorization', `Bearer ${a.token}`);
        await request(app).post(`/api/users/${owner.userId}/follow`).set('Authorization', `Bearer ${b.token}`);

        let count = await request(app).get('/api/notifications/unread-count').set('Authorization', `Bearer ${owner.token}`);
        expect(count.body.count).toBe(2);

        const read = await request(app).post('/api/notifications/read').set('Authorization', `Bearer ${owner.token}`).send({});
        expect(read.body.updated).toBe(2);

        count = await request(app).get('/api/notifications/unread-count').set('Authorization', `Bearer ${owner.token}`);
        expect(count.body.count).toBe(0);
    });

    it('marks only the specified notification ids as read', async () => {
        const owner = await createTestUser('notif-ids-owner@example.com', 'pass123', 'Owner');
        const a = await createTestUser('notif-ids-a@example.com', 'pass123', 'A');
        const p1 = createTestPin(owner.userId, { title: 'p1' });
        const p2 = createTestPin(owner.userId, { title: 'p2' });

        await request(app).post(`/api/likes/${p1}`).set('Authorization', `Bearer ${a.token}`);
        await request(app).post(`/api/likes/${p2}`).set('Authorization', `Bearer ${a.token}`);

        const list = await listNotifications(owner.token);
        const firstId = list.body.items[0].id;

        const read = await request(app).post('/api/notifications/read').set('Authorization', `Bearer ${owner.token}`).send({ ids: [firstId] });
        expect(read.body.updated).toBe(1);

        const count = await request(app).get('/api/notifications/unread-count').set('Authorization', `Bearer ${owner.token}`);
        expect(count.body.count).toBe(1);
    });

    it('does not let a user mark another user\'s notifications read', async () => {
        const owner = await createTestUser('notif-owner-iso@example.com', 'pass123', 'Owner');
        const attacker = await createTestUser('notif-attacker-iso@example.com', 'pass123', 'Attacker');
        const a = await createTestUser('notif-actor-iso@example.com', 'pass123', 'A');
        const pinId = createTestPin(owner.userId, { title: 'iso' });
        await request(app).post(`/api/likes/${pinId}`).set('Authorization', `Bearer ${a.token}`);

        const ownerList = await listNotifications(owner.token);
        const ownerNotifId = ownerList.body.items[0].id;

        const res = await request(app).post('/api/notifications/read').set('Authorization', `Bearer ${attacker.token}`).send({ ids: [ownerNotifId] });
        expect(res.body.updated).toBe(0);

        // Owner's notification is still unread.
        const count = await request(app).get('/api/notifications/unread-count').set('Authorization', `Bearer ${owner.token}`);
        expect(count.body.count).toBe(1);
    });
});

describe('Notification pagination', () => {
    it('paginates with a cursor and reports hasMore/nextCursor', async () => {
        const owner = await createTestUser('notif-page-owner@example.com', 'pass123', 'Owner');
        const actor = await createTestUser('notif-page-actor@example.com', 'pass123', 'Actor');

        // 22 like notifications (> PAGE_LIMIT of 20)
        for (let i = 0; i < 22; i++) {
            const pinId = createTestPin(owner.userId, { title: `p${i}` });
            await request(app).post(`/api/likes/${pinId}`).set('Authorization', `Bearer ${actor.token}`);
        }

        const page1 = await listNotifications(owner.token);
        expect(page1.body.items).toHaveLength(20);
        expect(page1.body.hasMore).toBe(true);
        expect(page1.body.nextCursor).toBe(page1.body.items[19].id);

        const page2 = await listNotifications(owner.token, page1.body.nextCursor);
        expect(page2.body.items).toHaveLength(2);
        expect(page2.body.hasMore).toBe(false);
        // Pages are strictly descending and non-overlapping.
        expect(page2.body.items[0].id).toBeLessThan(page1.body.items[19].id);
    });
});
