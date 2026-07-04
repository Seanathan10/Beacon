import * as db from "../database/db";

/**
 * Data-access layer for follow membership (`user_follow`) and the personalised
 * follow feed. Profile-oriented reads over the same table live in userRepo.
 */

/** Create a follow edge. Throws on the UNIQUE constraint if it already exists. */
export function insertFollow(followerID: number, followingID: number): void {
    db.query("INSERT INTO user_follow(followerID, followingID) VALUES(?, ?)", [followerID, followingID]);
}

/** Remove a follow edge; returns the run result (has `.changes`). */
export function deleteFollow(followerID: number, followingID: number): { changes: number } {
    return db.query(
        "DELETE FROM user_follow WHERE followerID = ? AND followingID = ?",
        [followerID, followingID],
    );
}

/**
 * A page of pins from accounts `userID` follows, newest first. When `cursor` is
 * set, only pins with a smaller id are returned (keyset pagination).
 */
export function findFeed(userID: number, cursor: number | null, limit: number): any[] {
    const base = `
        SELECT p.id, p.creatorID, a.name AS creatorName, a.email AS creatorEmail,
               p.title, p.description, p.image, p.tags, p.latitude, p.longitude, p.createdAt,
               (SELECT COUNT(*) FROM likes WHERE pinID = p.id) AS likes
        FROM pin p
        JOIN account a ON a.id = p.creatorID
        JOIN user_follow uf ON uf.followingID = p.creatorID
        WHERE uf.followerID = ?`;
    if (cursor) {
        return db.query(`${base} AND p.id < ? ORDER BY p.createdAt DESC LIMIT ?`, [userID, cursor, limit]);
    }
    return db.query(`${base} ORDER BY p.createdAt DESC LIMIT ?`, [userID, limit]);
}
