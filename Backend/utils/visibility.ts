import * as db from "../database/db";

/**
 * Whether `viewerID` may see `targetID`'s profile/data based on profileVisibility.
 * - public (or null): anyone
 * - friends: the owner, or a viewer who follows the target
 * - private: the owner only
 *
 * Use for single-resource checks. For list queries, prefer `visibilityFilter`
 * which pushes the same logic into SQL and avoids an N+1 of follow lookups.
 */
export function canViewProfile(
    viewerID: number | null,
    targetID: number,
    visibility: string | null,
): boolean {
    if (visibility === "private") return viewerID === targetID;
    if (visibility === "friends") {
        if (viewerID === targetID) return true;
        if (!viewerID) return false;
        return (
            db.query(
                "SELECT 1 FROM user_follow WHERE followerID = ? AND followingID = ?",
                [viewerID, targetID],
            ).length > 0
        );
    }
    return true; // public or null
}

/**
 * Build a SQL boolean fragment (and its params) that filters rows to those the
 * viewer is allowed to see, mirroring `canViewProfile` at the database level.
 *
 * @param viewerID      the authenticated viewer, or null if anonymous
 * @param accountAlias  table alias of the joined `account` row (e.g. "a")
 * @param creatorColumn the column holding the resource owner's id (e.g. "p.creatorID")
 * @returns `{ sql, params }` — `sql` is a parenthesised condition to AND into a WHERE clause
 */
export function visibilityFilter(
    viewerID: number | null,
    accountAlias: string,
    creatorColumn: string,
): { sql: string; params: (number | null)[] } {
    const v = `${accountAlias}.profileVisibility`;
    const sql = `(
        ${v} IS NULL
        OR ${v} = 'public'
        OR ${creatorColumn} = ?
        OR (${v} = 'friends' AND EXISTS (
            SELECT 1 FROM user_follow WHERE followerID = ? AND followingID = ${creatorColumn}
        ))
    )`;
    return { sql, params: [viewerID, viewerID] };
}
