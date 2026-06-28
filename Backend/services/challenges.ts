/**
 * Eco-challenge progress tracking.
 *
 * Challenges are advanced as a side-effect of existing user actions (saving a
 * trip, choosing a low-carbon option, visiting a place). Like notifications,
 * progress updates must never break the originating request, so
 * `recordChallengeEvent` swallows and logs its own errors.
 */
import { db } from "../database/db";
import { createNotification } from "./notifications";

export type ChallengeMetric = "trips_saved" | "carbon_saved" | "places_visited";

/**
 * Add `amount` to every active challenge that tracks `metric` for the given
 * user. When a challenge crosses its goal for the first time, stamp completedAt
 * and fire a self-directed 'challenge_complete' notification (actorID null so it
 * isn't suppressed by the no-self-notify rule).
 */
export function recordChallengeEvent(accountID: number, metric: ChallengeMetric, amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;

    try {
        const challenges = db.prepare(
            "SELECT id, goal FROM challenge WHERE metric = ? AND active = 1"
        ).all(metric) as { id: number; goal: number }[];

        for (const ch of challenges) {
            db.prepare(`
                INSERT INTO challenge_progress (challengeID, accountID, progress, updatedAt)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(challengeID, accountID) DO UPDATE SET
                    progress = progress + excluded.progress,
                    updatedAt = CURRENT_TIMESTAMP
            `).run(ch.id, accountID, amount);

            const row = db.prepare(
                "SELECT progress, completedAt FROM challenge_progress WHERE challengeID = ? AND accountID = ?"
            ).get(ch.id, accountID) as { progress: number; completedAt: string | null } | undefined;

            if (row && row.completedAt === null && row.progress >= ch.goal) {
                db.prepare(
                    "UPDATE challenge_progress SET completedAt = CURRENT_TIMESTAMP WHERE challengeID = ? AND accountID = ?"
                ).run(ch.id, accountID);
                createNotification({
                    recipientID: accountID,
                    actorID: null,
                    type: "challenge_complete",
                    entityType: "challenge",
                    entityID: ch.id,
                });
            }
        }
    } catch (err) {
        console.error("Failed to record challenge event:", err);
    }
}
