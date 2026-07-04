import * as db from "../database/db";

/**
 * Data-access layer for the `pin_status` table (a user's visited/wishlist marks).
 */

/** The viewer's status row for a pin (`{ status }`), or undefined if unset. */
export function findStatus(pinID: number, userID: number): { status: string } | undefined {
    return db.query("SELECT status FROM pin_status WHERE pinID = ? AND accountID = ?", [pinID, userID])[0];
}

/** Insert or update the viewer's status for a pin. */
export function upsertStatus(pinID: number, userID: number, status: string): void {
    db.query(
        `INSERT INTO pin_status (pinID, accountID, status, updatedAt)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(pinID, accountID) DO UPDATE SET
            status = excluded.status,
            updatedAt = CURRENT_TIMESTAMP`,
        [pinID, userID, status],
    );
}

/** Remove the viewer's status for a pin; returns the run result. */
export function deleteStatus(pinID: number, userID: number): { changes: number } {
    return db.query("DELETE FROM pin_status WHERE pinID = ? AND accountID = ?", [pinID, userID]);
}

/** All of the viewer's pin statuses. */
export function findAllForUser(userID: number): any[] {
    return db.query("SELECT pinID, status, updatedAt FROM pin_status WHERE accountID = ?", [userID]);
}
