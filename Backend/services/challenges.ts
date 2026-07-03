/**
 * Eco-challenge progress tracking.
 *
 * Challenges are advanced as a side-effect of existing user actions (saving a
 * trip, choosing a low-carbon option, visiting a place). Like notifications,
 * progress updates must never break the originating request, so
 * `recordChallengeEvent` swallows and logs its own errors.
 */
import * as challengeRepo from "../repositories/challengeRepo";
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
        const challenges = challengeRepo.findActiveByMetric(metric);

        for (const ch of challenges) {
            challengeRepo.addProgress(ch.id, accountID, amount);

            const row = challengeRepo.findProgress(ch.id, accountID);

            if (row && row.completedAt === null && row.progress >= ch.goal) {
                challengeRepo.markCompleted(ch.id, accountID);
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
