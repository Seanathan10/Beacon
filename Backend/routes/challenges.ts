import { Request, Response } from "express";
import * as challengeRepo from "../repositories/challengeRepo";
import { logError } from "../utils/logger";

/**
 * GET /api/me/challenges — list active eco-challenges with the viewer's progress.
 * Progress is reported raw (may exceed goal); the client clamps for display.
 */
export function getMyChallenges(req: Request, res: Response) {
    const userID = req.user.id;

    try {
        const rows = challengeRepo.findActiveWithProgress(userID) as {
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
