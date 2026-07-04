import * as db from "../database/db";

/**
 * Data-access layer for the `comment` and `comment_reaction` tables. Reaction
 * reads are batched (IN (...) queries) so a pin's comment list stays at a few
 * queries regardless of comment count.
 */

const COMMENT_SELECT = "c.id, c.pinID, c.accountID, c.comment, c.createdAt, a.email";

/** All comments on a pin, newest first, joined with the author's email. */
export function findByPin(pinID: string | number): any[] {
    return db.query(`
        SELECT ${COMMENT_SELECT}
        FROM comment c
        JOIN account a ON a.id = c.accountID
        WHERE c.pinID = ?
        ORDER BY c.createdAt DESC;
    `, [pinID]);
}

/** A single comment (with author email) by id, or undefined. */
export function findById(commentID: string | number): any | undefined {
    return db.query(`
        SELECT ${COMMENT_SELECT}
        FROM comment c
        JOIN account a ON a.id = c.accountID
        WHERE c.id = ?
    `, [commentID])[0];
}

/** Owner row (`{ accountID }`) or undefined when the comment does not exist. */
export function findOwner(commentID: string | number): { accountID: number } | undefined {
    return db.query("SELECT accountID FROM comment WHERE id = ?", [commentID])[0];
}

/** True when a comment with this id exists. */
export function exists(commentID: string | number): boolean {
    return db.query("SELECT id FROM comment WHERE id = ?", [commentID]).length > 0;
}

/** Insert a comment; returns the created row, or undefined on failure. */
export function insert(pinID: string | number, accountID: number, comment: string): any | undefined {
    return db.query(`
        INSERT INTO comment(pinID, accountID, comment, createdAt)
        VALUES(?, ?, ?, datetime('now'))
        RETURNING id, pinID, accountID, comment, createdAt;
    `, [pinID, accountID, comment])[0];
}

/** Update a comment's text. */
export function updateText(commentID: string | number, comment: string): void {
    db.query("UPDATE comment SET comment = ? WHERE id = ?", [comment, commentID]);
}

/** Delete a comment; returns the run result (has `.changes`). */
export function deleteById(commentID: string | number): { changes: number } {
    return db.query("DELETE FROM comment WHERE id = ?", [commentID]);
}

// ── Reactions ───────────────────────────────────────────────────────────────

/** Aggregated reaction counts for a set of comments (`{ commentID, emoji, count }`). */
export function findReactionCounts(commentIDs: number[]): any[] {
    if (commentIDs.length === 0) return [];
    const placeholders = commentIDs.map(() => "?").join(",");
    return db.query(`
        SELECT commentID, emoji, COUNT(*) as count
        FROM comment_reaction
        WHERE commentID IN (${placeholders})
        GROUP BY commentID, emoji
    `, commentIDs);
}

/** The reactions `userID` left on a set of comments (`{ commentID, emoji }`). */
export function findUserReactions(userID: number, commentIDs: number[]): any[] {
    if (commentIDs.length === 0) return [];
    const placeholders = commentIDs.map(() => "?").join(",");
    return db.query(`
        SELECT commentID, emoji
        FROM comment_reaction
        WHERE accountID = ? AND commentID IN (${placeholders})
    `, [userID, ...commentIDs]);
}

/** Idempotently add a reaction (INSERT OR IGNORE). */
export function addReaction(commentID: string | number, userID: number, emoji: string): void {
    db.query(
        "INSERT OR IGNORE INTO comment_reaction(commentID, accountID, emoji, createdAt) VALUES(?, ?, ?, datetime('now'))",
        [commentID, userID, emoji],
    );
}

/** Remove a reaction; returns the run result (has `.changes`). */
export function removeReaction(commentID: string | number, userID: number, emoji: string): { changes: number } {
    return db.query(
        "DELETE FROM comment_reaction WHERE commentID = ? AND accountID = ? AND emoji = ?",
        [commentID, userID, emoji],
    );
}
