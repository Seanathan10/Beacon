import { Request, Response } from "express";
import * as db from "../database/db";
import { logError } from "../utils/logger";

const MAX_CURSOR = 2_147_483_647; // upper bound for a notification ID cursor
const PAGE_LIMIT = 20;

/**
 * GET /api/notifications — cursor-paginated list of the viewer's notifications,
 * newest first. Joins the actor's public profile fields for rendering.
 */
export function getNotifications(req: Request, res: Response) {
    const userID = req.user.id;

    let cursor: number | null = null;
    if (req.query.cursor !== undefined) {
        const parsed = parseInt(req.query.cursor as string, 10);
        if (isNaN(parsed) || parsed < 1 || parsed > MAX_CURSOR) {
            return res.status(400).json({ message: "Invalid cursor" });
        }
        cursor = parsed;
    }

    const rows: any[] = cursor
        ? db.query(`
            SELECT n.id, n.type, n.entityType, n.entityID, n.isRead, n.createdAt,
                   n.actorID, a.name AS actorName, a.email AS actorEmail, a.avatar AS actorAvatar
            FROM notification n
            LEFT JOIN account a ON a.id = n.actorID
            WHERE n.recipientID = ? AND n.id < ?
            ORDER BY n.id DESC
            LIMIT ?
          `, [userID, cursor, PAGE_LIMIT + 1])
        : db.query(`
            SELECT n.id, n.type, n.entityType, n.entityID, n.isRead, n.createdAt,
                   n.actorID, a.name AS actorName, a.email AS actorEmail, a.avatar AS actorAvatar
            FROM notification n
            LEFT JOIN account a ON a.id = n.actorID
            WHERE n.recipientID = ?
            ORDER BY n.id DESC
            LIMIT ?
          `, [userID, PAGE_LIMIT + 1]);

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
    const row = db.query(
        "SELECT COUNT(*) AS count FROM notification WHERE recipientID = ? AND isRead = 0",
        [userID]
    )[0];
    res.json({ count: row?.count ?? 0 });
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
            const placeholders = numericIds.map(() => "?").join(", ");
            const result = db.query(
                `UPDATE notification SET isRead = 1 WHERE recipientID = ? AND id IN (${placeholders})`,
                [userID, ...numericIds]
            );
            return res.json({ updated: result.changes });
        }

        const result = db.query(
            "UPDATE notification SET isRead = 1 WHERE recipientID = ? AND isRead = 0",
            [userID]
        );
        res.json({ updated: result.changes });
    } catch (err) {
        logError(req, "Mark notifications read error", err);
        res.status(500).json({ message: "Failed to mark notifications read" });
    }
}
