import { Request, Response } from "express";
import * as db from "../database/db";

export function getUserStats(req: Request, res: Response) {
    const userID = req.user.id;

    const pinsCreated = (db.query("SELECT COUNT(*) as c FROM pin WHERE creatorID = ?", [userID])[0]?.c) ?? 0;
    const likesReceived = (db.query(
        "SELECT COUNT(*) as c FROM likes WHERE pinID IN (SELECT id FROM pin WHERE creatorID = ?)",
        [userID]
    )[0]?.c) ?? 0;
    const placesVisited = (db.query(
        "SELECT COUNT(*) as c FROM pin_status WHERE accountID = ? AND status = 'visited'",
        [userID]
    )[0]?.c) ?? 0;
    const wishlistCount = (db.query(
        "SELECT COUNT(*) as c FROM pin_status WHERE accountID = ? AND status = 'wishlist'",
        [userID]
    )[0]?.c) ?? 0;
    const bookmarksCount = (db.query(
        "SELECT COUNT(*) as c FROM bookmark WHERE accountID = ?",
        [userID]
    )[0]?.c) ?? 0;
    const commentsCount = (db.query(
        "SELECT COUNT(*) as c FROM comment WHERE accountID = ?",
        [userID]
    )[0]?.c) ?? 0;
    const postsCount = (db.query(
        "SELECT COUNT(*) as c FROM post WHERE creatorID = ?",
        [userID]
    )[0]?.c) ?? 0;
    const followersCount = (db.query(
        "SELECT COUNT(*) as c FROM user_follow WHERE followingID = ?",
        [userID]
    )[0]?.c) ?? 0;
    const followingCount = (db.query(
        "SELECT COUNT(*) as c FROM user_follow WHERE followerID = ?",
        [userID]
    )[0]?.c) ?? 0;

    res.json({
        pinsCreated,
        likesReceived,
        placesVisited,
        wishlistCount,
        bookmarksCount,
        commentsCount,
        postsCount,
        followersCount,
        followingCount,
    });
}

export function getUserActivity(req: Request, res: Response) {
    const userID = req.user.id;

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

    const activity = [...recentPins, ...recentComments, ...recentVisits]
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20);

    res.json(activity);
}
