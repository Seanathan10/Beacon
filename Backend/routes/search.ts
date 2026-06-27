import { Request, Response } from "express";
import * as db from "../database/db";
import { visibilityFilter } from "../utils/visibility";

const MAX_QUERY_LENGTH = 200;
const MAX_HISTORY_PER_USER = 50;
const DEFAULT_CONTENT_LIMIT = 5;
const MAX_CONTENT_LIMIT = 20;

function stripHtml(str: string): string {
    return str.replace(/<[^>]*>/g, '');
}

function parseContentSearch(req: Request): { query: string; like: string; prefix: string; limit: number } | null {
    const raw = req.query.q;
    if (typeof raw !== "string" || !raw.trim()) return null;

    const query = stripHtml(raw.trim()).slice(0, MAX_QUERY_LENGTH);
    if (!query) return null;

    const rawLimit = parseInt(String(req.query.limit ?? DEFAULT_CONTENT_LIMIT), 10);
    const limit = isNaN(rawLimit)
        ? DEFAULT_CONTENT_LIMIT
        : Math.min(Math.max(rawLimit, 1), MAX_CONTENT_LIMIT);

    return {
        query,
        like: `%${query}%`,
        prefix: `${query}%`,
        limit,
    };
}

export function searchContent(req: Request, res: Response) {
    const parsed = parseContentSearch(req);
    if (!parsed) {
        return res.status(400).json({ error: "Query is required" });
    }

    const userID = req.user?.id ?? null;
    const pinVis = visibilityFilter(userID, "a", "p.creatorID");
    const postVis = visibilityFilter(userID, "a", "p.creatorID");

    const pins = db.query(`
        SELECT
            p.id,
            p.creatorID,
            COALESCE(a.email, '') AS email,
            p.latitude,
            p.longitude,
            p.title,
            p.address,
            p.description,
            p.image,
            p.tags,
            p.createdAt,
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
        AND ${pinVis.sql}
        ORDER BY rank ASC, likes DESC, p.createdAt DESC
        LIMIT ?
    `, [
        userID,
        parsed.prefix,
        parsed.like,
        parsed.like,
        parsed.like,
        parsed.like,
        parsed.like,
        parsed.like,
        parsed.like,
        parsed.like,
        ...pinVis.params,
        parsed.limit,
    ]);

    const posts = db.query(`
        SELECT
            p.id,
            p.creatorID,
            COALESCE(a.email, '') AS email,
            p.title,
            p.location,
            p.latitude,
            p.longitude,
            p.category,
            p.tags,
            p.message,
            p.image,
            p.createdAt,
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
        AND ${postVis.sql}
        ORDER BY rank ASC, upvotes DESC, p.createdAt DESC
        LIMIT ?
    `, [
        parsed.prefix,
        parsed.like,
        parsed.like,
        parsed.like,
        parsed.like,
        parsed.like,
        parsed.like,
        parsed.like,
        parsed.like,
        parsed.like,
        ...postVis.params,
        parsed.limit,
    ]).map((post: any) => ({
        ...post,
        tags: post.tags ? post.tags.split(',').map((t: string) => t.trim()) : [],
    }));

    res.json({
        query: parsed.query,
        pins,
        posts,
    });
}

export function getSearchHistory(req: Request, res: Response) {
    const userID = req.user.id;
    const results = db.query(
        `SELECT id, query, createdAt
         FROM search_history
         WHERE accountID = ?
         ORDER BY createdAt DESC, id DESC
         LIMIT 10`,
        [userID],
    );
    res.json(results);
}

export function addSearchHistory(req: Request, res: Response) {
    const userID = req.user.id;
    const raw = req.body?.query;

    if (typeof raw !== "string" || !raw.trim()) {
        return res.status(400).json({ error: "Query is required" });
    }

    const query = stripHtml(raw.trim()).slice(0, MAX_QUERY_LENGTH);
    if (!query) {
        return res.status(400).json({ error: "Query is required" });
    }

    // De-dupe: remove an existing identical query so the new one is the freshest.
    db.query(
        `DELETE FROM search_history WHERE accountID = ? AND query = ?`,
        [userID, query],
    );

    db.query(
        `INSERT INTO search_history (accountID, query, createdAt)
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [userID, query],
    );

    // Enforce retention cap: keep only the latest MAX_HISTORY_PER_USER per user.
    db.query(
        `DELETE FROM search_history
         WHERE accountID = ?
           AND id NOT IN (
             SELECT id FROM search_history
             WHERE accountID = ?
             ORDER BY createdAt DESC, id DESC
             LIMIT ?
           )`,
        [userID, userID, MAX_HISTORY_PER_USER],
    );

    const [row] = db.query(
        `SELECT id, query, createdAt
         FROM search_history
         WHERE accountID = ? AND query = ?
         ORDER BY createdAt DESC, id DESC
         LIMIT 1`,
        [userID, query],
    );

    res.status(201).json(row);
}

export function deleteSearchHistoryEntry(req: Request, res: Response) {
    const userID = req.user.id;
    const entryID = parseInt(String(req.params.id), 10);

    if (isNaN(entryID)) {
        return res.status(400).json({ error: "Invalid history id" });
    }

    const result = db.query(
        `DELETE FROM search_history WHERE id = ? AND accountID = ?`,
        [entryID, userID],
    );

    if (!result.changes) {
        return res.status(404).json({ message: "Entry not found" });
    }

    res.status(204).send();
}

export function clearSearchHistory(req: Request, res: Response) {
    const userID = req.user.id;
    db.query(`DELETE FROM search_history WHERE accountID = ?`, [userID]);
    res.status(204).send();
}
