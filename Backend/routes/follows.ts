import { Request, Response } from "express";
import * as db from "../database/db";
import { logError } from "../utils/logger";

const MAX_CURSOR = 2_147_483_647; // upper bound for a pin ID cursor

export function followUser(req: Request, res: Response) {
    const followerID = req.user.id;
    const followingID = parseInt(String(req.params.userID), 10);

    if (followerID === followingID) {
        return res.status(400).json({ message: "Cannot follow yourself" });
    }

    const target = db.query("SELECT id FROM account WHERE id = ?", [followingID])[0];
    if (!target) return res.status(404).json({ message: "User not found" });

    // Idempotent, but we no longer use INSERT OR IGNORE — that would also swallow
    // genuine constraint/schema errors and report success. Instead we explicitly
    // treat an existing relationship (or a UNIQUE race) as success and surface
    // anything else as a 500.
    const existing = db.query(
        "SELECT 1 FROM user_follow WHERE followerID = ? AND followingID = ?",
        [followerID, followingID]
    );
    if (existing.length > 0) {
        return res.status(204).send();
    }

    try {
        db.query(
            "INSERT INTO user_follow(followerID, followingID) VALUES(?, ?)",
            [followerID, followingID]
        );
        res.status(204).send();
    } catch (err: any) {
        if (err.code === 'SQLITE_CONSTRAINT' || err.message?.includes('UNIQUE constraint failed')) {
            return res.status(204).send(); // concurrent follow — already following
        }
        logError(req, "Follow error", err);
        res.status(500).json({ message: "Failed to follow user" });
    }
}

export function unfollowUser(req: Request, res: Response) {
    const followerID = req.user.id;
    const followingID = parseInt(String(req.params.userID), 10);

    const result = db.query(
        "DELETE FROM user_follow WHERE followerID = ? AND followingID = ?",
        [followerID, followingID]
    );

    if (result.changes === 0) {
        return res.status(404).json({ message: "Not following this user" });
    }
    res.status(204).send();
}

export function getFollowFeed(req: Request, res: Response) {
    const userID = req.user.id;

    let cursor: number | null = null;
    if (req.query.cursor !== undefined) {
        const parsed = parseInt(req.query.cursor as string, 10);
        if (isNaN(parsed) || parsed < 1 || parsed > MAX_CURSOR) {
            return res.status(400).json({ message: "Invalid cursor" });
        }
        cursor = parsed;
    }
    const limit = 10;

    const rows: any[] = cursor
        ? db.query(`
            SELECT p.id, p.creatorID, a.name AS creatorName, a.email AS creatorEmail,
                   p.title, p.description, p.image, p.tags, p.latitude, p.longitude, p.createdAt,
                   (SELECT COUNT(*) FROM likes WHERE pinID = p.id) AS likes
            FROM pin p
            JOIN account a ON a.id = p.creatorID
            JOIN user_follow uf ON uf.followingID = p.creatorID
            WHERE uf.followerID = ? AND p.id < ?
            ORDER BY p.createdAt DESC
            LIMIT ?
          `, [userID, cursor, limit + 1])
        : db.query(`
            SELECT p.id, p.creatorID, a.name AS creatorName, a.email AS creatorEmail,
                   p.title, p.description, p.image, p.tags, p.latitude, p.longitude, p.createdAt,
                   (SELECT COUNT(*) FROM likes WHERE pinID = p.id) AS likes
            FROM pin p
            JOIN account a ON a.id = p.creatorID
            JOIN user_follow uf ON uf.followingID = p.creatorID
            WHERE uf.followerID = ?
            ORDER BY p.createdAt DESC
            LIMIT ?
          `, [userID, limit + 1]);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    res.json({ items, nextCursor, hasMore });
}
