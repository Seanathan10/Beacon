import * as db from "../database/db";

/**
 * Data-access layer for the `likes` table and the denormalised `pin.likes`
 * counter. The insert/delete keep the counter in sync inside a transaction so
 * it can never drift from the authoritative likes table.
 */

/** Like count + whether `userID` has liked the pin, or undefined if pin missing. */
export function getLikeStatus(pinID: string | number, userID: number): { likes: number; wasLiked: number } | undefined {
    return db.query(`
        SELECT
            (SELECT COUNT(*) FROM likes WHERE pinID = ?) AS likes,
            EXISTS (SELECT 1 FROM likes WHERE accountID = ? AND pinID = ?) AS wasLiked
        FROM pin p
        WHERE p.id = ?;
    `, [pinID, userID, pinID, pinID])[0];
}

/** True when `userID` has liked `pinID`. */
export function hasLiked(pinID: string | number, userID: number): boolean {
    return db.query("SELECT 1 FROM likes WHERE pinID = ? AND accountID = ?", [pinID, userID]).length > 0;
}

/**
 * Insert a like and bump the denormalised counter atomically. Throws on the
 * UNIQUE (already liked) or FOREIGN KEY (pin missing) constraint; callers map
 * those to 409 / 404.
 */
export function addLike(pinID: string | number, userID: number): { changes: number } {
    return db.transaction(() => {
        const r = db.query("INSERT INTO likes(pinID, accountID) VALUES(?, ?);", [pinID, userID]);
        db.query("UPDATE pin SET likes = likes + 1 WHERE id = ?;", [pinID]);
        return r;
    });
}

/** Delete a like and decrement the counter (clamped at 0) atomically. */
export function removeLike(pinID: string | number, userID: number): { changes: number } {
    return db.transaction(() => {
        const r = db.query("DELETE FROM likes WHERE pinID = ? AND accountID = ?;", [pinID, userID]);
        if (r.changes > 0) {
            db.query("UPDATE pin SET likes = MAX(0, likes - 1) WHERE id = ?;", [pinID]);
        }
        return r;
    });
}

/** All pins liked by `userID`, newest first, with author email and like count. */
export function findLikedPins(userID: number): any[] {
    return db.query(`
        SELECT
            p.id, p.creatorID, a.email, p.latitude, p.longitude,
            p.title, p.address, p.description, p.image, p.tags, p.createdAt,
            (SELECT COUNT(*) FROM likes WHERE pinID = p.id) AS likes
        FROM likes l
        JOIN pin p ON p.id = l.pinID
        JOIN account a ON a.id = p.creatorID
        WHERE l.accountID = ?
        ORDER BY p.createdAt DESC
    `, [userID]);
}
