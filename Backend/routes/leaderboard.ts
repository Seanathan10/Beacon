import { Request, Response } from "express";
import { db } from "../database/db";
import { logError } from "../utils/logger";

const LIMIT = 20;

/**
 * GET /api/leaderboard — community ranking by total CO₂ saved across saved/shared
 * trips. Opt-in by privacy: only users with a public profile are listed (private
 * and friends-only profiles are excluded), honouring profileVisibility.
 */
export function getLeaderboard(req: Request, res: Response) {
    try {
        const rows = db.prepare(`
            SELECT a.id AS accountID, a.name, a.avatar,
                   ROUND(COALESCE(SUM(i.savedKg), 0), 2) AS totalSavedKg,
                   COUNT(i.id) AS tripCount
            FROM account a
            JOIN itinerary i ON i.creatorID = a.id AND i.savedKg IS NOT NULL
            WHERE (a.profileVisibility IS NULL OR a.profileVisibility = 'public')
            GROUP BY a.id
            HAVING totalSavedKg > 0
            ORDER BY totalSavedKg DESC, tripCount DESC
            LIMIT ?
        `).all(LIMIT) as { accountID: number; name: string | null; avatar: string | null; totalSavedKg: number; tripCount: number }[];

        const items = rows.map((r, idx) => ({
            rank: idx + 1,
            accountID: r.accountID,
            name: r.name,
            avatar: r.avatar,
            totalSavedKg: r.totalSavedKg,
            tripCount: r.tripCount,
        }));

        res.json({ items });
    } catch (err) {
        logError(req, "Leaderboard error", err);
        res.status(500).json({ message: "Failed to load leaderboard" });
    }
}
