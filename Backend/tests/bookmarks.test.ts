import request from 'supertest';
import { createTestApp, createTestUser } from './helpers/testApp';

let app: any;
let token: string;
let userId: number;
let pinId: number;

beforeAll(async () => {
	app = await createTestApp();
});

describe('Bookmarks Endpoint', () => {
	beforeEach(async () => {
		const user = await createTestUser('bookmarktest@example.com', 'password123', 'Bookmark Test');
		token = user.token;
		userId = user.userId;

		const pinRes = await request(app)
			.post('/api/pins')
			.set('Authorization', `Bearer ${token}`)
			.send({
				title: 'Test Pin',
				latitude: 37.7749,
				longitude: -122.4194,
				address: 'San Francisco, CA',
				description: 'A test pin',
				tags: ['test'],
			});
		pinId = pinRes.body.id;
	});

	describe('POST /api/bookmarks', () => {
		it('should create a bookmark', async () => {
			const res = await request(app)
				.post('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`)
				.send({ pinID: pinId });

			expect(res.status).toBe(201);
			expect(res.body.message).toBe('Bookmark created');
		});

		it('should fail to bookmark without auth', async () => {
			const res = await request(app)
				.post('/api/bookmarks')
				.send({ pinID: pinId });

			expect(res.status).toBe(401);
		});

		it('should fail to bookmark non-existent pin', async () => {
			const res = await request(app)
				.post('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`)
				.send({ pinID: 99999 });

			expect(res.status).toBe(404);
		});

		it('should reject duplicate bookmark', async () => {
			await request(app)
				.post('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`)
				.send({ pinID: pinId });

			const res = await request(app)
				.post('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`)
				.send({ pinID: pinId });

			expect(res.status).toBe(409);
		});

		it('should require pinID', async () => {
			const res = await request(app)
				.post('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`)
				.send({});

			expect(res.status).toBe(400);
		});
	});

	describe('GET /api/bookmarks', () => {
		it('should return bookmarks for authenticated user', async () => {
			await request(app)
				.post('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`)
				.send({ pinID: pinId });

			const res = await request(app)
				.get('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBeGreaterThan(0);
			expect(res.body[0]).toHaveProperty('pinID');
			expect(res.body[0]).toHaveProperty('folderID');
			expect(res.body[0]).toHaveProperty('createdAt');
		});

		it('should fail without auth', async () => {
			const res = await request(app).get('/api/bookmarks');

			expect(res.status).toBe(401);
		});
	});

	describe('Cross-user bookmark isolation', () => {
		it('should not allow user B to delete user A bookmark', async () => {
			await request(app)
				.post('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`)
				.send({ pinID: pinId });

			const userB = await createTestUser('userb@example.com', 'pass', 'User B');

			const res = await request(app)
				.delete(`/api/bookmarks/${pinId}`)
				.set('Authorization', `Bearer ${userB.token}`);

			expect(res.status).toBe(404);

			const check = await request(app)
				.get('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`);
			expect(check.body.some((b: any) => b.pinID === pinId)).toBe(true);
		});
	});

	describe('Bookmark cascade on pin deletion', () => {
		it('should remove bookmark when the bookmarked pin is deleted', async () => {
			await request(app)
				.post('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`)
				.send({ pinID: pinId });

			await request(app)
				.delete(`/api/pins/${pinId}`)
				.set('Authorization', `Bearer ${token}`);

			const res = await request(app)
				.get('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(200);
			expect(res.body.some((b: any) => b.pinID === pinId)).toBe(false);
		});
	});

	describe('DELETE /api/bookmarks/{pinID}', () => {
		it('should remove a bookmark', async () => {
			await request(app)
				.post('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`)
				.send({ pinID: pinId });

			const res = await request(app)
				.delete(`/api/bookmarks/${pinId}`)
				.set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(204);
		});

		it('should fail to remove non-existent bookmark', async () => {
			const res = await request(app)
				.delete('/api/bookmarks/99999')
				.set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(404);
		});

		it('should fail without auth', async () => {
			const res = await request(app).delete(`/api/bookmarks/${pinId}`);

			expect(res.status).toBe(401);
		});
	});

	describe('PATCH /api/bookmarks/{pinID}', () => {
		it('should update bookmark with valid folderID', async () => {
			await request(app)
				.post('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`)
				.send({ pinID: pinId });

			const folderRes = await request(app)
				.post('/api/bookmarks/folders')
				.set('Authorization', `Bearer ${token}`)
				.send({ name: 'Test Folder' });
			const folderId = folderRes.body.id;

			const res = await request(app)
				.patch(`/api/bookmarks/${pinId}`)
				.set('Authorization', `Bearer ${token}`)
				.send({ folderID: folderId });

			expect(res.status).toBe(200);
			expect(res.body.message).toBe('Bookmark updated');
		});

		it('should move bookmark to uncategorized', async () => {
			await request(app)
				.post('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`)
				.send({ pinID: pinId });

			const folderRes = await request(app)
				.post('/api/bookmarks/folders')
				.set('Authorization', `Bearer ${token}`)
				.send({ name: 'Temp Folder' });
			const folderId = folderRes.body.id;

			await request(app)
				.patch(`/api/bookmarks/${pinId}`)
				.set('Authorization', `Bearer ${token}`)
				.send({ folderID: folderId });

			const res = await request(app)
				.patch(`/api/bookmarks/${pinId}`)
				.set('Authorization', `Bearer ${token}`)
				.send({ folderID: null });

			expect(res.status).toBe(200);
		});

		it('should fail without auth', async () => {
			const res = await request(app)
				.patch(`/api/bookmarks/${pinId}`)
				.send({ folderID: null });

			expect(res.status).toBe(401);
		});

		it('should fail with invalid folderID', async () => {
			await request(app)
				.post('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`)
				.send({ pinID: pinId });

			const res = await request(app)
				.patch(`/api/bookmarks/${pinId}`)
				.set('Authorization', `Bearer ${token}`)
				.send({ folderID: 'invalid-uuid' });

			expect(res.status).toBe(404);
		});
	});

	describe('POST /api/bookmarks/folders', () => {
		it('should create a folder', async () => {
			const res = await request(app)
				.post('/api/bookmarks/folders')
				.set('Authorization', `Bearer ${token}`)
				.send({ name: 'Summer Trips' });

			expect(res.status).toBe(201);
			expect(res.body).toHaveProperty('id');
			expect(res.body.name).toBe('Summer Trips');
			expect(res.body.isPublic).toBe(0);
		});

		it('should create a public folder', async () => {
			const res = await request(app)
				.post('/api/bookmarks/folders')
				.set('Authorization', `Bearer ${token}`)
				.send({ name: 'Public List', isPublic: true });

			expect(res.status).toBe(201);
			expect(res.body.isPublic).toBe(1);
		});

		it('should fail without name', async () => {
			const res = await request(app)
				.post('/api/bookmarks/folders')
				.set('Authorization', `Bearer ${token}`)
				.send({});

			expect(res.status).toBe(400);
		});

		it('should fail without auth', async () => {
			const res = await request(app)
				.post('/api/bookmarks/folders')
				.send({ name: 'Test' });

			expect(res.status).toBe(401);
		});

		it('should enforce name length limit', async () => {
			const res = await request(app)
				.post('/api/bookmarks/folders')
				.set('Authorization', `Bearer ${token}`)
				.send({ name: 'x'.repeat(81) });

			expect(res.status).toBe(400);
		});
	});

	describe('GET /api/bookmarks/folders', () => {
		it('should list folders for authenticated user', async () => {
			const res = await request(app)
				.get('/api/bookmarks/folders')
				.set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			res.body.forEach((folder: any) => {
				expect(folder).toHaveProperty('id');
				expect(folder).toHaveProperty('name');
				expect(folder).toHaveProperty('isPublic');
				expect(folder).toHaveProperty('pinCount');
			});
		});

		it('should fail without auth', async () => {
			const res = await request(app).get('/api/bookmarks/folders');

			expect(res.status).toBe(401);
		});
	});

	describe('PATCH /api/bookmarks/folders/{id}', () => {
		let testFolderId: string;

		beforeEach(async () => {
			const res = await request(app)
				.post('/api/bookmarks/folders')
				.set('Authorization', `Bearer ${token}`)
				.send({ name: 'Original Name' });
			testFolderId = res.body.id;
		});

		it('should update folder name', async () => {
			const res = await request(app)
				.patch(`/api/bookmarks/folders/${testFolderId}`)
				.set('Authorization', `Bearer ${token}`)
				.send({ name: 'Updated Name' });

			expect(res.status).toBe(200);
			expect(res.body.message).toBe('Folder updated');
		});

		it('should toggle public visibility', async () => {
			const res = await request(app)
				.patch(`/api/bookmarks/folders/${testFolderId}`)
				.set('Authorization', `Bearer ${token}`)
				.send({ isPublic: true });

			expect(res.status).toBe(200);
		});

		it('should fail without auth', async () => {
			const res = await request(app)
				.patch(`/api/bookmarks/folders/${testFolderId}`)
				.send({ name: 'Hacked' });

			expect(res.status).toBe(401);
		});

		it('should fail if not owner', async () => {
			const otherUser = await createTestUser('other@example.com', 'pass', 'Other');

			const res = await request(app)
				.patch(`/api/bookmarks/folders/${testFolderId}`)
				.set('Authorization', `Bearer ${otherUser.token}`)
				.send({ name: 'Hacked' });

			expect(res.status).toBe(403);
		});

		it('should fail with non-existent folder', async () => {
			const res = await request(app)
				.patch('/api/bookmarks/folders/00000000-0000-0000-0000-000000000000')
				.set('Authorization', `Bearer ${token}`)
				.send({ name: 'Test' });

			expect(res.status).toBe(404);
		});
	});

	describe('DELETE /api/bookmarks/folders/{id}', () => {
		it('should delete folder and cascade bookmarks to uncategorized', async () => {
			const folderRes = await request(app)
				.post('/api/bookmarks/folders')
				.set('Authorization', `Bearer ${token}`)
				.send({ name: 'To Delete' });
			const testFolderId = folderRes.body.id;

			await request(app)
				.post('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`)
				.send({ pinID: pinId, folderID: testFolderId });

			const res = await request(app)
				.delete(`/api/bookmarks/folders/${testFolderId}`)
				.set('Authorization', `Bearer ${token}`);

			expect(res.status).toBe(204);

			const bookmarksRes = await request(app)
				.get('/api/bookmarks')
				.set('Authorization', `Bearer ${token}`);

			const bookmark = bookmarksRes.body.find((b: any) => b.pinID === pinId);
			expect(bookmark).toBeDefined();
			expect(bookmark.folderID).toBeNull();
		});

		it('should fail without auth', async () => {
			const folderRes = await request(app)
				.post('/api/bookmarks/folders')
				.set('Authorization', `Bearer ${token}`)
				.send({ name: 'Protected Folder' });
			const testFolderId = folderRes.body.id;

			const res = await request(app).delete(
				`/api/bookmarks/folders/${testFolderId}`
			);

			expect(res.status).toBe(401);
		});

		it('should fail if not owner', async () => {
			const otherUser = await createTestUser('otherdelete@example.com', 'pass', 'Other Delete');
			const newFolderRes = await request(app)
				.post('/api/bookmarks/folders')
				.set('Authorization', `Bearer ${token}`)
				.send({ name: 'Another Folder' });
			const newFolderId = newFolderRes.body.id;

			const res = await request(app)
				.delete(`/api/bookmarks/folders/${newFolderId}`)
				.set('Authorization', `Bearer ${otherUser.token}`);

			expect(res.status).toBe(403);
		});
	});
});
