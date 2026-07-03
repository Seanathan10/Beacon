import * as db from "../database/db";

/**
 * Data-access layer for `challenge` and `challenge_progress`. Serves both the
 * "my challenges" read and the progress-tracking side-effects in
 * services/challenges.ts.
 */

/** Active challenges with the viewer's progress (0 when none), by id ascending. */
export function findActiveWithProgress(userID: number): any[] {
    return db.query(`
        SELECT c.id, c.code, c.title, c.description, c.metric, c.goal, c.icon,
               COALESCE(cp.progress, 0) AS progress,
               cp.completedAt
        FROM challenge c
        LEFT JOIN challenge_progress cp
            ON cp.challengeID = c.id AND cp.accountID = ?
        WHERE c.active = 1
        ORDER BY c.id ASC
    `, [userID]);
}

/** Active challenges tracking a given metric. */
export function findActiveByMetric(metric: string): { id: number; goal: number }[] {
    return db.query("SELECT id, goal FROM challenge WHERE metric = ? AND active = 1", [metric]);
}

/** Add to a user's progress for a challenge (upsert). */
export function addProgress(challengeID: number, accountID: number, amount: number): void {
    db.query(`
        INSERT INTO challenge_progress (challengeID, accountID, progress, updatedAt)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(challengeID, accountID) DO UPDATE SET
            progress = progress + excluded.progress,
            updatedAt = CURRENT_TIMESTAMP
    `, [challengeID, accountID, amount]);
}

/** A user's progress row for a challenge, or undefined. */
export function findProgress(challengeID: number, accountID: number): { progress: number; completedAt: string | null } | undefined {
    return db.query(
        "SELECT progress, completedAt FROM challenge_progress WHERE challengeID = ? AND accountID = ?",
        [challengeID, accountID],
    )[0];
}

/** Stamp a challenge as completed for a user (sets completedAt = now). */
export function markCompleted(challengeID: number, accountID: number): void {
    db.query(
        "UPDATE challenge_progress SET completedAt = CURRENT_TIMESTAMP WHERE challengeID = ? AND accountID = ?",
        [challengeID, accountID],
    );
}
