import { Request, Response } from "express";
import * as leaderboardRepo from "../repositories/leaderboardRepo";
import { logError } from "../utils/logger";

const LIMIT = 20;

/**
 * GET /api/leaderboard — community ranking by total CO₂ saved across saved/shared
 * trips. Opt-in by privacy: only users with a public profile are listed (private
 * and friends-only profiles are excluded), honouring profileVisibility.
 */
export function getLeaderboard(req: Request, res: Response) {
    try {
        const rows = leaderboardRepo.getTopBySavedCarbon(LIMIT) as { accountID: number; name: string | null; avatar: string | null; totalSavedKg: number; tripCount: number }[];

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
