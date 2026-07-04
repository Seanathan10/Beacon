import * as db from "../database/db";

/**
 * Data-access layer for the `itinerary` table (saved drafts + published trip
 * snapshots). Shared by the My Trips routes and the public share routes.
 */

/** A page of a user's itineraries (drafts + published), newest first by rowid. */
export function findByCreatorPaged(userID: number, cursor: number | null, limit: number): any[] {
    const base = "SELECT rowid AS _rowid, id, title, isPublic, data, createdAt FROM itinerary WHERE creatorID = ?";
    if (cursor) {
        return db.query(`${base} AND rowid < ? ORDER BY rowid DESC LIMIT ?`, [userID, cursor, limit]);
    }
    return db.query(`${base} ORDER BY rowid DESC LIMIT ?`, [userID, limit]);
}

/** Full itinerary row by id (no ownership/visibility filter), or undefined. */
export function findById(id: string): { id: string; creatorID: number | null; title: string | null; data: string; isPublic: number; createdAt: string } | undefined {
    return db.query("SELECT id, creatorID, title, data, isPublic, createdAt FROM itinerary WHERE id = ?", [id])[0];
}

/** `{ creatorID, isPublic }` for an itinerary, or undefined. */
export function findOwnerAndPublic(id: string): { creatorID: number | null; isPublic: number } | undefined {
    return db.query("SELECT creatorID, isPublic FROM itinerary WHERE id = ?", [id])[0];
}

/** `{ creatorID }` for an itinerary, or undefined. */
export function findCreator(id: string): { creatorID: number | null } | undefined {
    return db.query("SELECT creatorID FROM itinerary WHERE id = ?", [id])[0];
}

/** A published snapshot's data + createdAt (isPublic = 1 only), or undefined. */
export function findPublicById(id: string): { data: string; createdAt: string } | undefined {
    return db.query("SELECT data, createdAt FROM itinerary WHERE id = ? AND isPublic = 1", [id])[0];
}

/** Aggregate carbon totals across a user's trips that carry carbon data. */
export function getCarbonTotals(userID: number): { tripCount: number; totalCarbonKg: number; totalSavedKg: number } {
    return db.query(`
        SELECT COUNT(*) AS tripCount,
               COALESCE(SUM(carbonKg), 0) AS totalCarbonKg,
               COALESCE(SUM(savedKg), 0) AS totalSavedKg
        FROM itinerary
        WHERE creatorID = ? AND carbonKg IS NOT NULL
    `, [userID])[0];
}

/** Per-month carbon breakdown for a user's trips, oldest month first. */
export function getCarbonByMonth(userID: number): { month: string; count: number; carbonKg: number; savedKg: number }[] {
    return db.query(`
        SELECT strftime('%Y-%m', createdAt) AS month,
               COUNT(*) AS count,
               COALESCE(SUM(carbonKg), 0) AS carbonKg,
               COALESCE(SUM(savedKg), 0) AS savedKg
        FROM itinerary
        WHERE creatorID = ? AND carbonKg IS NOT NULL
        GROUP BY month
        ORDER BY month ASC
    `, [userID]);
}

/** Insert a private draft (isPublic = 0). */
export function insertDraft(id: string, userID: number | null, title: string | null, data: string, carbonKg: number | null, savedKg: number | null): void {
    db.query(
        "INSERT INTO itinerary (id, creatorID, title, data, isPublic, carbonKg, savedKg) VALUES (?, ?, ?, ?, 0, ?, ?)",
        [id, userID, title, data, carbonKg, savedKg],
    );
}

/** Insert a published snapshot (isPublic = 1). */
export function insertPublished(id: string, userID: number | null, title: string | null, data: string, carbonKg: number | null, savedKg: number | null): void {
    db.query(
        "INSERT INTO itinerary (id, creatorID, title, data, isPublic, carbonKg, savedKg) VALUES (?, ?, ?, ?, 1, ?, ?)",
        [id, userID, title, data, carbonKg, savedKg],
    );
}

/** Update an owned draft's contents. */
export function updateDraft(id: string, userID: number, title: string | null, data: string, carbonKg: number | null, savedKg: number | null): void {
    db.query(
        "UPDATE itinerary SET title = ?, data = ?, carbonKg = ?, savedKg = ? WHERE id = ? AND creatorID = ?",
        [title, data, carbonKg, savedKg, id, userID],
    );
}

/** Delete an itinerary by id. */
export function deleteById(id: string): void {
    db.query("DELETE FROM itinerary WHERE id = ?", [id]);
}
