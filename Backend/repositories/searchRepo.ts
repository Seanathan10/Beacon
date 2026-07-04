import * as db from "../database/db";
import { visibilityFilter } from "../utils/visibility";

/**
 * Data-access layer for content search (over `pin` and `post`) and the
 * per-user `search_history` table.
 */

export interface SearchParams {
    userID: number | null;
    /** `query%` — used to rank exact-prefix title matches highest. */
    prefix: string;
    /** `%query%` — used for the substring match / lower ranks. */
    like: string;
    limit: number;
}

/** Ranked pin search respecting the viewer's visibility filter. */
export function searchPins(p: SearchParams): any[] {
    const vis = visibilityFilter(p.userID, "a", "p.creatorID");
    return db.query(`
        SELECT
            p.id, p.creatorID, COALESCE(a.email, '') AS email,
            p.latitude, p.longitude, p.title, p.address, p.description,
            p.image, p.tags, p.createdAt,
            (SELECT COUNT(*) FROM likes WHERE pinID = p.id) AS likes,
            (SELECT status FROM pin_status WHERE pinID = p.id AND accountID = ?) AS userStatus,
            CASE
                WHEN p.title LIKE ? THEN 1
                WHEN p.title LIKE ? THEN 2
                WHEN p.tags LIKE ? THEN 3
                WHEN p.address LIKE ? OR p.description LIKE ? THEN 4
                ELSE 5
            END AS rank
        FROM pin p
        LEFT JOIN account a ON a.id = p.creatorID
        WHERE (
            p.title LIKE ?
            OR p.description LIKE ?
            OR p.address LIKE ?
            OR p.tags LIKE ?
        )
        AND ${vis.sql}
        ORDER BY rank ASC, likes DESC, p.createdAt DESC
        LIMIT ?
    `, [
        p.userID,
        p.prefix, p.like, p.like, p.like, p.like,
        p.like, p.like, p.like, p.like,
        ...vis.params,
        p.limit,
    ]);
}

/** Ranked post search respecting the viewer's visibility filter. */
export function searchPosts(p: SearchParams): any[] {
    const vis = visibilityFilter(p.userID, "a", "p.creatorID");
    return db.query(`
        SELECT
            p.id, p.creatorID, COALESCE(a.email, '') AS email,
            p.title, p.location, p.latitude, p.longitude, p.category,
            p.tags, p.message, p.image, p.createdAt,
            (SELECT COUNT(*) FROM post_upvote WHERE postID = p.id) AS upvotes,
            CASE
                WHEN p.title LIKE ? THEN 1
                WHEN p.title LIKE ? THEN 2
                WHEN p.tags LIKE ? THEN 3
                WHEN p.location LIKE ? OR p.message LIKE ? THEN 4
                ELSE 5
            END AS rank
        FROM post p
        LEFT JOIN account a ON a.id = p.creatorID
        WHERE (
            p.title LIKE ?
            OR p.message LIKE ?
            OR p.location LIKE ?
            OR p.tags LIKE ?
            OR p.category LIKE ?
        )
        AND ${vis.sql}
        ORDER BY rank ASC, upvotes DESC, p.createdAt DESC
        LIMIT ?
    `, [
        p.prefix, p.like, p.like, p.like, p.like,
        p.like, p.like, p.like, p.like, p.like,
        ...vis.params,
        p.limit,
    ]);
}

// ── Search history ──────────────────────────────────────────────────────────

/** The user's 10 most recent searches. */
export function getHistory(userID: number): any[] {
    return db.query(
        `SELECT id, query, createdAt FROM search_history
         WHERE accountID = ? ORDER BY createdAt DESC, id DESC LIMIT 10`,
        [userID],
    );
}

/** Remove any existing identical query (de-dupe before re-inserting). */
export function deleteHistoryByQuery(userID: number, query: string): void {
    db.query("DELETE FROM search_history WHERE accountID = ? AND query = ?", [userID, query]);
}

/** Insert a search history entry. */
export function insertHistory(userID: number, query: string): void {
    db.query(
        "INSERT INTO search_history (accountID, query, createdAt) VALUES (?, ?, CURRENT_TIMESTAMP)",
        [userID, query],
    );
}

/** Enforce the retention cap: keep only the latest `max` entries for the user. */
export function trimHistory(userID: number, max: number): void {
    db.query(
        `DELETE FROM search_history
         WHERE accountID = ?
           AND id NOT IN (
             SELECT id FROM search_history
             WHERE accountID = ?
             ORDER BY createdAt DESC, id DESC
             LIMIT ?
           )`,
        [userID, userID, max],
    );
}

/** The most recent history row matching a query (returned after insert). */
export function findLatestByQuery(userID: number, query: string): any | undefined {
    return db.query(
        `SELECT id, query, createdAt FROM search_history
         WHERE accountID = ? AND query = ? ORDER BY createdAt DESC, id DESC LIMIT 1`,
        [userID, query],
    )[0];
}

/** Delete a single history entry owned by the user. */
export function deleteHistoryEntry(entryID: number, userID: number): { changes: number } {
    return db.query("DELETE FROM search_history WHERE id = ? AND accountID = ?", [entryID, userID]);
}

/** Clear all of the user's search history. */
export function clearHistory(userID: number): void {
    db.query("DELETE FROM search_history WHERE accountID = ?", [userID]);
}
