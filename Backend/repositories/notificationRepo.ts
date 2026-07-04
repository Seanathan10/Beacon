import * as db from "../database/db";

/**
 * Data-access layer for the `notification` table (reads + mark-read). Creation
 * of notifications lives in services/notifications.ts.
 */

/**
 * A page of the viewer's notifications, newest first, joined with the actor's
 * public profile fields. When `cursor` is set, only notifications with a smaller
 * id are returned (keyset pagination).
 */
export function findPage(userID: number, cursor: number | null, limit: number): any[] {
    const base = `
        SELECT n.id, n.type, n.entityType, n.entityID, n.isRead, n.createdAt,
               n.actorID, a.name AS actorName, a.email AS actorEmail, a.avatar AS actorAvatar
        FROM notification n
        LEFT JOIN account a ON a.id = n.actorID
        WHERE n.recipientID = ?`;
    if (cursor) {
        return db.query(`${base} AND n.id < ? ORDER BY n.id DESC LIMIT ?`, [userID, cursor, limit]);
    }
    return db.query(`${base} ORDER BY n.id DESC LIMIT ?`, [userID, limit]);
}

/** Insert a notification row. */
export function insert(
    recipientID: number,
    actorID: number | null,
    type: string,
    entityType: string | null,
    entityID: number | null,
): void {
    db.query(
        `INSERT INTO notification (recipientID, actorID, type, entityType, entityID)
         VALUES (?, ?, ?, ?, ?)`,
        [recipientID, actorID, type, entityType, entityID],
    );
}

/** Count of the viewer's unread notifications. */
export function countUnread(userID: number): number {
    return db.query(
        "SELECT COUNT(*) AS count FROM notification WHERE recipientID = ? AND isRead = 0",
        [userID],
    )[0]?.count ?? 0;
}

/** Mark specific notifications read (only the viewer's own); returns run result. */
export function markReadByIds(userID: number, ids: number[]): { changes: number } {
    const placeholders = ids.map(() => "?").join(", ");
    return db.query(
        `UPDATE notification SET isRead = 1 WHERE recipientID = ? AND id IN (${placeholders})`,
        [userID, ...ids],
    );
}

/** Mark all of the viewer's unread notifications read; returns run result. */
export function markAllRead(userID: number): { changes: number } {
    return db.query("UPDATE notification SET isRead = 1 WHERE recipientID = ? AND isRead = 0", [userID]);
}
