import { Request, Response } from "express";
import * as bookmarkRepo from "../repositories/bookmarkRepo";
import { randomUUID } from "crypto";
import { logError } from "../utils/logger";
import { isOwner } from "../utils/ownership";

/**
 * GET /api/bookmarks - List all bookmarked pins for the authenticated user
 */
export function getBookmarks(req: Request, res: Response) {
	if (!req.user?.id) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	res.json(bookmarkRepo.findBookmarks(req.user.id));
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
		const results = bookmarkRepo.addBookmark(pinID, req.user.id, folderID || null);

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
		logError(req, "Bookmark error", error);
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

	const results = bookmarkRepo.deleteBookmark(Number(pinID), req.user.id);

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
		const results = bookmarkRepo.updateBookmarkFolder(Number(pinID), req.user.id, folderID || null);

		if (results.changes === 0) {
			return res.status(404).json({ message: "Bookmark not found" });
		}

		res.status(200).json({ message: "Bookmark updated" });
	} catch (error: any) {
		if (error.message?.includes("FOREIGN KEY constraint failed")) {
			return res.status(404).json({ message: "Folder not found" });
		}
		logError(req, "Update bookmark error", error);
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

	res.json(bookmarkRepo.findFolders(req.user.id));
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
		const results = bookmarkRepo.insertFolder(folderId, req.user.id, name.trim(), isPublic ? 1 : 0);

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
		logError(req, "Create folder error", error);
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

	const id = String(req.params.id);
	const { name, isPublic } = req.body;

	// Verify user owns this folder
	const folder = bookmarkRepo.findFolderOwner(id);

	if (!folder) {
		return res.status(404).json({ message: "Folder not found" });
	}

	if (!isOwner(folder.accountID, req.user.id)) {
		return res.status(403).json({ message: "Forbidden" });
	}

	const fields: Record<string, unknown> = {};

	if (name !== undefined) {
		if (typeof name !== "string" || name.trim().length === 0) {
			return res.status(400).json({ message: "Folder name is required" });
		}
		if (name.trim().length > 80) {
			return res.status(400).json({ message: "Folder name must be 80 characters or less" });
		}
		fields.name = name.trim();
	}

	if (isPublic !== undefined) {
		fields.isPublic = isPublic ? 1 : 0;
	}

	if (Object.keys(fields).length === 0) {
		return res.status(400).json({ message: "No fields to update" });
	}

	try {
		const results = bookmarkRepo.updateFolder(id, fields);

		if (results.changes === 0) {
			return res.status(404).json({ message: "Folder not found" });
		}

		res.status(200).json({ message: "Folder updated" });
	} catch (error: any) {
		logError(req, "Update folder error", error);
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

	const id = String(req.params.id);

	// Verify user owns this folder
	const folder = bookmarkRepo.findFolderOwner(id);

	if (!folder) {
		return res.status(404).json({ message: "Folder not found" });
	}

	if (!isOwner(folder.accountID, req.user.id)) {
		return res.status(403).json({ message: "Forbidden" });
	}

	try {
		// Reassigns this folder's bookmarks to uncategorized and deletes the
		// folder atomically, so bookmarks are never left orphaned.
		const results = bookmarkRepo.deleteFolderWithReassign(id, req.user.id);

		if (results.changes === 0) {
			return res.status(404).json({ message: "Folder not found" });
		}

		res.status(204).send();
	} catch (error: any) {
		logError(req, "Delete folder error", error);
		res.status(500).json({ message: "Internal server error" });
	}
}
