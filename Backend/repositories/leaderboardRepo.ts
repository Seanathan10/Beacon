import * as db from "../database/db";

/**
 * Read-model for the community carbon-savings leaderboard (spans `account` and
 * `itinerary`). Only public profiles are included, honouring profileVisibility.
 */

/** Top accounts by total CO₂ saved across their trips, most saved first. */
export function getTopBySavedCarbon(limit: number): any[] {
    return db.query(`
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
    `, [limit]);
}
