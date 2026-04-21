import { Request, Response } from "express";
import * as db from "../database/db";
import { randomUUID } from "crypto";

/**
 * GET /api/bookmarks - List all bookmarked pins for the authenticated user
 */
export function getBookmarks(req: Request, res: Response) {
	if (!req.user?.id) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	const results = db.query(`
		SELECT
			b.pinID,
			b.folderID,
			b.createdAt,
			p.creatorID,
			a.email,
			p.latitude,
			p.longitude,
			p.title,
			p.address,
			p.description,
			p.image,
			p.tags,
			p.createdAt as pinCreatedAt,
			(SELECT COUNT(*) FROM likes WHERE pinID = p.id) AS likes
		FROM bookmark b
		JOIN pin p ON p.id = b.pinID
		JOIN account a ON a.id = p.creatorID
		WHERE b.accountID = ?
		ORDER BY b.createdAt DESC
	`, [req.user.id]);

	res.json(results);
}

/**
 * POST /api/bookmarks - Bookmark a pin for the authenticated user
 */
export function addBookmark(req: Request, res: Response) {
	if (!req.user?.id) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	const { pinID, folderID } = req.body;

	if (!pinID || typeof pinID !== "number") {
		return res.status(400).json({ message: "pinID is required and must be a number" });
	}

	if (folderID && typeof folderID !== "string") {
		return res.status(400).json({ message: "folderID must be a string" });
	}

	try {
		const results = db.query(
			`INSERT INTO bookmark (pinID, accountID, folderID) VALUES (?, ?, ?)`,
			[pinID, req.user.id, folderID || null]
		);

		if (results.changes === 0) {
			return res.status(500).json({ message: "Failed to create bookmark" });
		}

		res.status(201).json({ message: "Bookmark created" });
	} catch (error: any) {
		if (error.message?.includes("UNIQUE constraint failed")) {
			return res.status(409).json({ message: "Pin already bookmarked" });
		}
		if (error.message?.includes("FOREIGN KEY constraint failed")) {
			return res.status(404).json({ message: "Pin or folder not found" });
		}
		console.error("Bookmark error:", error);
		res.status(500).json({ message: "Internal server error" });
	}
}

/**
 * DELETE /api/bookmarks/:pinID - Remove a bookmark
 */
export function deleteBookmark(req: Request, res: Response) {
	if (!req.user?.id) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	const { pinID } = req.params;

	if (!pinID || isNaN(Number(pinID))) {
		return res.status(400).json({ message: "Invalid pinID" });
	}

	const results = db.query(
		`DELETE FROM bookmark WHERE pinID = ? AND accountID = ?`,
		[Number(pinID), req.user.id]
	);

	if (results.changes === 0) {
		return res.status(404).json({ message: "Bookmark not found" });
	}

	res.status(204).send();
}

/**
 * PATCH /api/bookmarks/:pinID - Reassign a pin to a different folder
 */
export function updateBookmark(req: Request, res: Response) {
	if (!req.user?.id) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	const { pinID } = req.params;
	const { folderID } = req.body;

	if (!pinID || isNaN(Number(pinID))) {
		return res.status(400).json({ message: "Invalid pinID" });
	}

	if (folderID && typeof folderID !== "string") {
		return res.status(400).json({ message: "folderID must be a string or null" });
	}

	try {
		const results = db.query(
			`UPDATE bookmark SET folderID = ? WHERE pinID = ? AND accountID = ?`,
			[folderID || null, Number(pinID), req.user.id]
		);

		if (results.changes === 0) {
			return res.status(404).json({ message: "Bookmark not found" });
		}

		res.status(200).json({ message: "Bookmark updated" });
	} catch (error: any) {
		if (error.message?.includes("FOREIGN KEY constraint failed")) {
			return res.status(404).json({ message: "Folder not found" });
		}
		console.error("Update bookmark error:", error);
		res.status(500).json({ message: "Internal server error" });
	}
}

/**
 * GET /api/bookmarks/folders - List all folders for the authenticated user
 */
export function getFolders(req: Request, res: Response) {
	if (!req.user?.id) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	const results = db.query(`
		SELECT
			bf.id,
			bf.name,
			bf.isPublic,
			bf.createdAt,
			(SELECT COUNT(*) FROM bookmark WHERE folderID = bf.id) AS pinCount
		FROM bookmark_folder bf
		WHERE bf.accountID = ?
		ORDER BY bf.createdAt DESC
	`, [req.user.id]);

	res.json(results);
}

/**
 * POST /api/bookmarks/folders - Create a new folder
 */
export function createFolder(req: Request, res: Response) {
	if (!req.user?.id) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	const { name, isPublic } = req.body;

	if (!name || typeof name !== "string" || name.trim().length === 0) {
		return res.status(400).json({ message: "Folder name is required" });
	}

	if (name.trim().length > 80) {
		return res.status(400).json({ message: "Folder name must be 80 characters or less" });
	}

	const folderId = randomUUID();

	try {
		const results = db.query(
			`INSERT INTO bookmark_folder (id, accountID, name, isPublic) VALUES (?, ?, ?, ?)`,
			[folderId, req.user.id, name.trim(), isPublic ? 1 : 0]
		);

		if (results.changes === 0) {
			return res.status(500).json({ message: "Failed to create folder" });
		}

		res.status(201).json({
			id: folderId,
			name: name.trim(),
			isPublic: isPublic ? 1 : 0,
			createdAt: new Date().toISOString(),
			pinCount: 0
		});
	} catch (error: any) {
		console.error("Create folder error:", error);
		res.status(500).json({ message: "Internal server error" });
	}
}

/**
 * PATCH /api/bookmarks/folders/:id - Update folder name or visibility
 */
export function updateFolder(req: Request, res: Response) {
	if (!req.user?.id) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	const { id } = req.params;
	const { name, isPublic } = req.body;

	// Verify user owns this folder
	const folderCheck = db.query(
		`SELECT accountID FROM bookmark_folder WHERE id = ?`,
		[id]
	);

	if (folderCheck.length === 0) {
		return res.status(404).json({ message: "Folder not found" });
	}

	if (folderCheck[0].accountID !== req.user.id) {
		return res.status(403).json({ message: "Forbidden" });
	}

	const updates = [];
	const params = [];

	if (name !== undefined) {
		if (typeof name !== "string" || name.trim().length === 0) {
			return res.status(400).json({ message: "Folder name is required" });
		}
		if (name.trim().length > 80) {
			return res.status(400).json({ message: "Folder name must be 80 characters or less" });
		}
		updates.push("name = ?");
		params.push(name.trim());
	}

	if (isPublic !== undefined) {
		updates.push("isPublic = ?");
		params.push(isPublic ? 1 : 0);
	}

	if (updates.length === 0) {
		return res.status(400).json({ message: "No fields to update" });
	}

	params.push(id);

	try {
		const results = db.query(
			`UPDATE bookmark_folder SET ${updates.join(", ")} WHERE id = ?`,
			params
		);

		if (results.changes === 0) {
			return res.status(404).json({ message: "Folder not found" });
		}

		res.status(200).json({ message: "Folder updated" });
	} catch (error: any) {
		console.error("Update folder error:", error);
		res.status(500).json({ message: "Internal server error" });
	}
}

/**
 * DELETE /api/bookmarks/folders/:id - Delete a folder and move its bookmarks to uncategorized
 */
export function deleteFolder(req: Request, res: Response) {
	if (!req.user?.id) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	const { id } = req.params;

	// Verify user owns this folder
	const folderCheck = db.query(
		`SELECT accountID FROM bookmark_folder WHERE id = ?`,
		[id]
	);

	if (folderCheck.length === 0) {
		return res.status(404).json({ message: "Folder not found" });
	}

	if (folderCheck[0].accountID !== req.user.id) {
		return res.status(403).json({ message: "Forbidden" });
	}

	try {
		// Move bookmarks in this folder to uncategorized (folderID = NULL)
		db.query(
			`UPDATE bookmark SET folderID = NULL WHERE folderID = ?`,
			[id]
		);

		// Delete the folder
		const results = db.query(
			`DELETE FROM bookmark_folder WHERE id = ? AND accountID = ?`,
			[id, req.user.id]
		);

		if (results.changes === 0) {
			return res.status(404).json({ message: "Folder not found" });
		}

		res.status(204).send();
	} catch (error: any) {
		console.error("Delete folder error:", error);
		res.status(500).json({ message: "Internal server error" });
	}
}
