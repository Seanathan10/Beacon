import { Request, Response } from "express";
import * as db from "../database/db";

const MAX_QUERY_LENGTH = 200;
const MAX_HISTORY_PER_USER = 50;

function stripHtml(str: string): string {
    return str.replace(/<[^>]*>/g, '');
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
