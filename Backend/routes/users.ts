import { Request, Response } from "express";
import * as db from "../database/db";

function isValidUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return ['http:', 'https:'].includes(urlObj.protocol);
    } catch {
        return false;
    }
}

export function getUser(req: Request, res: Response) {
    const targetID = parseInt(req.params.userID, 10);
    const viewerID = req.user?.id ?? null;

    const user = db.query(`
        SELECT a.id, a.name, a.email, a.bio, a.avatar, a.profileVisibility,
            (SELECT COUNT(*) FROM user_follow WHERE followingID = a.id) AS followerCount,
            (SELECT COUNT(*) FROM user_follow WHERE followerID = a.id) AS followingCount
        FROM account a WHERE a.id = ?
    `, [targetID])[0];

    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.profileVisibility === 'private' && viewerID !== targetID) {
        return res.status(403).json({ message: "This profile is private" });
    }

    const isFollowed = viewerID ? db.query(
        "SELECT 1 FROM user_follow WHERE followerID = ? AND followingID = ?",
        [viewerID, targetID]
    ).length > 0 : false;

    res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
        profileVisibility: user.profileVisibility,
        followerCount: user.followerCount,
        followingCount: user.followingCount,
        isFollowed,
        isOwn: viewerID === targetID,
    });
}

export function updateMe(req: Request, res: Response) {
    const userID = req.user.id;
    const { bio, avatar, profileVisibility } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (bio !== undefined) {
        const bioStr = String(bio ?? '').trim();
        if (bioStr.length > 300) {
            return res.status(400).json({ message: "Bio must be 300 characters or less" });
        }
        updates.push("bio = ?");
        params.push(bioStr || null);
    }

    if (avatar !== undefined) {
        if (avatar && !isValidUrl(String(avatar))) {
            return res.status(400).json({ message: "Invalid avatar URL" });
        }
        updates.push("avatar = ?");
        params.push(avatar || null);
    }

    if (profileVisibility !== undefined) {
        if (!['public', 'friends', 'private'].includes(profileVisibility)) {
            return res.status(400).json({ message: "Invalid visibility option" });
        }
        updates.push("profileVisibility = ?");
        params.push(profileVisibility);
    }

    if (updates.length === 0) {
        return res.status(400).json({ message: "No fields to update" });
    }

    params.push(userID);
    db.query(`UPDATE account SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = db.query(
        "SELECT id, name, email, bio, avatar, profileVisibility FROM account WHERE id = ?",
        [userID]
    )[0];
    res.json(updated);
}

export function getUserPins(req: Request, res: Response) {
    const targetID = parseInt(req.params.userID, 10);
    const viewerID = req.user?.id ?? null;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = 20;
    const offset = (page - 1) * limit;

    const user = db.query("SELECT profileVisibility FROM account WHERE id = ?", [targetID])[0];
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.profileVisibility === 'private' && viewerID !== targetID) {
        return res.json({ pins: [], page, hasMore: false });
    }

    const rows = db.query(`
        SELECT p.id, p.creatorID, p.latitude, p.longitude, p.title, p.address,
               p.description, p.image, p.tags, p.createdAt,
               (SELECT COUNT(*) FROM likes WHERE pinID = p.id) AS likes
        FROM pin p WHERE p.creatorID = ?
        ORDER BY p.createdAt DESC
        LIMIT ? OFFSET ?
    `, [targetID, limit + 1, offset]);

    const hasMore = rows.length > limit;
    res.json({ pins: rows.slice(0, limit), page, hasMore });
}

export function getUserFollowers(req: Request, res: Response) {
    const targetID = parseInt(req.params.userID, 10);
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = 20;
    const offset = (page - 1) * limit;
    const viewerID = req.user?.id ?? null;

    const user = db.query("SELECT id FROM account WHERE id = ?", [targetID])[0];
    if (!user) return res.status(404).json({ message: "User not found" });

    const rows = db.query(`
        SELECT a.id, a.name, a.email, a.bio, a.avatar,
            (SELECT COUNT(*) FROM user_follow WHERE followingID = a.id) AS followerCount
        FROM user_follow uf
        JOIN account a ON a.id = uf.followerID
        WHERE uf.followingID = ?
        ORDER BY uf.createdAt DESC
        LIMIT ? OFFSET ?
    `, [targetID, limit + 1, offset]);

    const enriched = rows.slice(0, limit).map((f: any) => ({
        ...f,
        isFollowed: viewerID ? db.query(
            "SELECT 1 FROM user_follow WHERE followerID = ? AND followingID = ?",
            [viewerID, f.id]
        ).length > 0 : false,
    }));

    res.json({ followers: enriched, page, hasMore: rows.length > limit });
}

export function getUserFollowing(req: Request, res: Response) {
    const targetID = parseInt(req.params.userID, 10);
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = 20;
    const offset = (page - 1) * limit;
    const viewerID = req.user?.id ?? null;

    const user = db.query("SELECT id FROM account WHERE id = ?", [targetID])[0];
    if (!user) return res.status(404).json({ message: "User not found" });

    const rows = db.query(`
        SELECT a.id, a.name, a.email, a.bio, a.avatar,
            (SELECT COUNT(*) FROM user_follow WHERE followingID = a.id) AS followerCount
        FROM user_follow uf
        JOIN account a ON a.id = uf.followingID
        WHERE uf.followerID = ?
        ORDER BY uf.createdAt DESC
        LIMIT ? OFFSET ?
    `, [targetID, limit + 1, offset]);

    const enriched = rows.slice(0, limit).map((f: any) => ({
        ...f,
        isFollowed: viewerID ? db.query(
            "SELECT 1 FROM user_follow WHERE followerID = ? AND followingID = ?",
            [viewerID, f.id]
        ).length > 0 : false,
    }));

    res.json({ following: enriched, page, hasMore: rows.length > limit });
}
