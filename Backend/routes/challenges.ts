import { Request, Response } from "express";
import { db } from "../database/db";
import { logError } from "../utils/logger";

/**
 * GET /api/me/challenges — list active eco-challenges with the viewer's progress.
 * Progress is reported raw (may exceed goal); the client clamps for display.
 */
export function getMyChallenges(req: Request, res: Response) {
    const userID = req.user.id;

    try {
        const rows = db.prepare(`
            SELECT c.id, c.code, c.title, c.description, c.metric, c.goal, c.icon,
                   COALESCE(cp.progress, 0) AS progress,
                   cp.completedAt
            FROM challenge c
            LEFT JOIN challenge_progress cp
                ON cp.challengeID = c.id AND cp.accountID = ?
            WHERE c.active = 1
            ORDER BY c.id ASC
        `).all(userID) as {
            id: number; code: string; title: string; description: string | null;
            metric: string; goal: number; icon: string | null;
            progress: number; completedAt: string | null;
        }[];

        const items = rows.map((r) => ({
            id: r.id,
            code: r.code,
            title: r.title,
            description: r.description,
            metric: r.metric,
            goal: r.goal,
            icon: r.icon,
            progress: Math.round(r.progress * 100) / 100,
            completed: r.completedAt !== null,
            completedAt: r.completedAt,
        }));

        res.json({ items });
    } catch (err) {
        logError(req, "List challenges error", err);
        res.status(500).json({ message: "Failed to list challenges" });
    }
}
