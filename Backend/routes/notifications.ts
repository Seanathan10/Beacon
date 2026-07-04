import { Request, Response } from "express";
import * as notificationRepo from "../repositories/notificationRepo";
import { logError } from "../utils/logger";
import { parseCursor } from "../utils/pagination";

const MAX_CURSOR = 2_147_483_647; // upper bound for a notification ID cursor
const PAGE_LIMIT = 20;

/**
 * GET /api/notifications — cursor-paginated list of the viewer's notifications,
 * newest first. Joins the actor's public profile fields for rendering.
 */
export function getNotifications(req: Request, res: Response) {
    const userID = req.user.id;

    const cursor = parseCursor(req.query.cursor, MAX_CURSOR);
    if (cursor === "invalid") {
        return res.status(400).json({ message: "Invalid cursor" });
    }

    const rows = notificationRepo.findPage(userID, cursor, PAGE_LIMIT + 1);

    const hasMore = rows.length > PAGE_LIMIT;
    const items = rows.slice(0, PAGE_LIMIT).map((r) => ({ ...r, isRead: r.isRead === 1 }));
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    res.json({ items, nextCursor, hasMore });
}

/**
 * GET /api/notifications/unread-count — number of unread notifications.
 */
export function getUnreadCount(req: Request, res: Response) {
    const userID = req.user.id;
    res.json({ count: notificationRepo.countUnread(userID) });
}

/**
 * POST /api/notifications/read — mark notifications read. Pass `{ ids: number[] }`
 * to mark specific ones, or omit `ids` to mark all of the viewer's as read.
 * Only ever affects rows owned by the viewer.
 */
export function markRead(req: Request, res: Response) {
    const userID = req.user.id;
    const ids = req.body?.ids;

    try {
        if (Array.isArray(ids)) {
            const numericIds = ids
                .map((x) => parseInt(String(x), 10))
                .filter((x) => Number.isInteger(x) && x > 0);
            if (numericIds.length === 0) {
                return res.json({ updated: 0 });
            }
            const result = notificationRepo.markReadByIds(userID, numericIds);
            return res.json({ updated: result.changes });
        }

        const result = notificationRepo.markAllRead(userID);
        res.json({ updated: result.changes });
    } catch (err) {
        logError(req, "Mark notifications read error", err);
        res.status(500).json({ message: "Failed to mark notifications read" });
    }
}
