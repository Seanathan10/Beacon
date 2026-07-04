import * as db from "../database/db";

/**
 * Data-access layer for the `account` table and profile-oriented reads over
 * `user_follow`. Membership actions (follow/unfollow, the personalised feed)
 * live in followRepo; this repo covers viewing accounts and their social graph.
 */

/** Public profile with follower/following counts, or undefined if not found. */
export function findProfile(targetID: number): any | undefined {
    return db.query(`
        SELECT a.id, a.name, a.email, a.bio, a.avatar, a.profileVisibility,
            (SELECT COUNT(*) FROM user_follow WHERE followingID = a.id) AS followerCount,
            (SELECT COUNT(*) FROM user_follow WHERE followerID = a.id) AS followingCount
        FROM account a WHERE a.id = ?
    `, [targetID])[0];
}

/** `{ id, profileVisibility }` for an account, or undefined if not found. */
export function findVisibility(targetID: number): { id: number; profileVisibility: string } | undefined {
    return db.query("SELECT id, profileVisibility FROM account WHERE id = ?", [targetID])[0];
}

/** True when an account with this id exists. */
export function exists(id: number): boolean {
    return db.query("SELECT id FROM account WHERE id = ?", [id]).length > 0;
}

/** Account row incl. password hash, for login. Undefined if no such email. */
export function findByEmailWithPassword(email: string): { id: number; email: string; name: string; password: string } | undefined {
    return db.query("SELECT id, email, name, password FROM account WHERE email = ?", [email])[0];
}

/** True when an account already uses this email. */
export function existsByEmail(email: string): boolean {
    return db.query("SELECT id FROM account WHERE email = ?", [email]).length > 0;
}

/** Create an account and return its new id. */
export function createAccount(email: string, hashedPassword: string, name: string | null): number {
    db.query("INSERT INTO account (email, password, name) VALUES (?, ?, ?)", [email, hashedPassword, name]);
    return db.query("SELECT last_insert_rowid() as id")[0].id;
}

/** True when `viewerID` follows `targetID`. */
export function isFollowing(viewerID: number, targetID: number): boolean {
    return db.query(
        "SELECT 1 FROM user_follow WHERE followerID = ? AND followingID = ?",
        [viewerID, targetID],
    ).length > 0;
}

/** Apply a partial update to an account. Column names come from trusted callers. */
export function updateAccount(userID: number, fields: Record<string, unknown>): void {
    db.updateById("account", fields, "id", userID);
}

/** The editable profile fields for an account (used after updateMe). */
export function findAccountBasic(userID: number): any | undefined {
    return db.query(
        "SELECT id, name, email, bio, avatar, profileVisibility FROM account WHERE id = ?",
        [userID],
    )[0];
}

/** An account's email address, or undefined if not found. */
export function findEmail(userID: number): string | undefined {
    return db.query("SELECT email FROM account WHERE id = ?", [userID])[0]?.email;
}

/**
 * A page of `targetID`'s followers, each flagged with whether `viewerID`
 * follows them back (single query, no N+1). `isFollowedFlag` is 1/0.
 */
export function findFollowers(viewerID: number | null, targetID: number, limit: number, offset: number): any[] {
    return db.query(`
        SELECT a.id, a.name, a.email, a.bio, a.avatar,
            (SELECT COUNT(*) FROM user_follow WHERE followingID = a.id) AS followerCount,
            CASE WHEN vf.followerID IS NOT NULL THEN 1 ELSE 0 END AS isFollowedFlag
        FROM user_follow uf
        JOIN account a ON a.id = uf.followerID
        LEFT JOIN user_follow vf ON vf.followingID = a.id AND vf.followerID = ?
        WHERE uf.followingID = ?
        ORDER BY uf.createdAt DESC
        LIMIT ? OFFSET ?
    `, [viewerID, targetID, limit, offset]);
}

/** A page of the accounts `targetID` follows, flagged with viewer follow-back. */
export function findFollowing(viewerID: number | null, targetID: number, limit: number, offset: number): any[] {
    return db.query(`
        SELECT a.id, a.name, a.email, a.bio, a.avatar,
            (SELECT COUNT(*) FROM user_follow WHERE followingID = a.id) AS followerCount,
            CASE WHEN vf.followerID IS NOT NULL THEN 1 ELSE 0 END AS isFollowedFlag
        FROM user_follow uf
        JOIN account a ON a.id = uf.followingID
        LEFT JOIN user_follow vf ON vf.followingID = a.id AND vf.followerID = ?
        WHERE uf.followerID = ?
        ORDER BY uf.createdAt DESC
        LIMIT ? OFFSET ?
    `, [viewerID, targetID, limit, offset]);
}
