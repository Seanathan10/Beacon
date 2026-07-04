import * as db from "../database/db";

/**
 * Read-model queries for a user's aggregate stats and recent activity. These
 * span several tables, so they live in their own repository rather than any one
 * table's repo.
 */

function count(sql: string, userID: number): number {
    return db.query(sql, [userID])[0]?.c ?? 0;
}

/** Aggregate counts for a user's profile/stats view. */
export function getUserStats(userID: number) {
    return {
        pinsCreated: count("SELECT COUNT(*) as c FROM pin WHERE creatorID = ?", userID),
        likesReceived: count(
            "SELECT COUNT(*) as c FROM likes WHERE pinID IN (SELECT id FROM pin WHERE creatorID = ?)",
            userID,
        ),
        placesVisited: count("SELECT COUNT(*) as c FROM pin_status WHERE accountID = ? AND status = 'visited'", userID),
        wishlistCount: count("SELECT COUNT(*) as c FROM pin_status WHERE accountID = ? AND status = 'wishlist'", userID),
        bookmarksCount: count("SELECT COUNT(*) as c FROM bookmark WHERE accountID = ?", userID),
        commentsCount: count("SELECT COUNT(*) as c FROM comment WHERE accountID = ?", userID),
        postsCount: count("SELECT COUNT(*) as c FROM post WHERE creatorID = ?", userID),
        followersCount: count("SELECT COUNT(*) as c FROM user_follow WHERE followingID = ?", userID),
        followingCount: count("SELECT COUNT(*) as c FROM user_follow WHERE followerID = ?", userID),
    };
}

/** A user's most recent pins, comments and visits (last 30 days), merged newest-first. */
export function getRecentActivity(userID: number): any[] {
    const recentPins = db.query(`
        SELECT 'pin_created' as type, id as relatedID, title as summary, createdAt
        FROM pin WHERE creatorID = ? AND createdAt >= datetime('now', '-30 days')
        ORDER BY createdAt DESC LIMIT 10
    `, [userID]);

    const recentComments = db.query(`
        SELECT 'comment_added' as type, c.id as relatedID,
               substr(c.comment, 1, 50) as summary, c.createdAt
        FROM comment c WHERE c.accountID = ? AND c.createdAt >= datetime('now', '-30 days')
        ORDER BY c.createdAt DESC LIMIT 10
    `, [userID]);

    const recentVisits = db.query(`
        SELECT 'place_visited' as type, ps.pinID as relatedID,
               p.title as summary, ps.updatedAt as createdAt
        FROM pin_status ps JOIN pin p ON p.id = ps.pinID
        WHERE ps.accountID = ? AND ps.status = 'visited'
          AND ps.updatedAt >= datetime('now', '-30 days')
        ORDER BY ps.updatedAt DESC LIMIT 10
    `, [userID]);

    return [...recentPins, ...recentComments, ...recentVisits]
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20);
}
