import { Request, Response } from "express";
import * as userRepo from "../repositories/userRepo";
import * as pinRepo from "../repositories/pinRepo";
import { canViewProfile } from "../utils/visibility";

function isValidUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return ['http:', 'https:'].includes(urlObj.protocol);
    } catch {
        return false;
    }
}

const MAX_PAGE = 10_000; // cap pagination so a huge `page` can't force a giant OFFSET scan

function parsePage(raw: unknown): number {
    const page = parseInt(String(raw ?? "1"), 10);
    if (isNaN(page) || page < 1) return 1;
    return Math.min(page, MAX_PAGE);
}

export function getUser(req: Request, res: Response) {
    const targetID = parseInt(String(req.params.userID), 10);
    const viewerID = req.user?.id ?? null;

    const user = userRepo.findProfile(targetID);

    if (!user) return res.status(404).json({ message: "User not found" });

    if (!canViewProfile(viewerID, targetID, user.profileVisibility)) {
        return res.status(403).json({ message: "This profile is private" });
    }

    const isFollowed = viewerID ? userRepo.isFollowing(viewerID, targetID) : false;

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

    const fields: Record<string, unknown> = {};

    if (bio !== undefined) {
        const bioStr = String(bio ?? '').trim();
        if (bioStr.length > 300) {
            return res.status(400).json({ message: "Bio must be 300 characters or less" });
        }
        fields.bio = bioStr || null;
    }

    if (avatar !== undefined) {
        if (avatar && !isValidUrl(String(avatar))) {
            return res.status(400).json({ message: "Invalid avatar URL" });
        }
        fields.avatar = avatar || null;
    }

    if (profileVisibility !== undefined) {
        if (!['public', 'friends', 'private'].includes(profileVisibility)) {
            return res.status(400).json({ message: "Invalid visibility option" });
        }
        fields.profileVisibility = profileVisibility;
    }

    if (Object.keys(fields).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
    }

    userRepo.updateAccount(userID, fields);

    res.json(userRepo.findAccountBasic(userID));
}

export function getUserPins(req: Request, res: Response) {
    const targetID = parseInt(String(req.params.userID), 10);
    const viewerID = req.user?.id ?? null;
    const page = parsePage(req.query.page);
    const limit = 20;
    const offset = (page - 1) * limit;

    const user = userRepo.findVisibility(targetID);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!canViewProfile(viewerID, targetID, user.profileVisibility)) {
        return res.json({ pins: [], page, hasMore: false });
    }

    const rows = pinRepo.findByCreatorPaged(targetID, limit + 1, offset);

    const hasMore = rows.length > limit;
    res.json({ pins: rows.slice(0, limit), page, hasMore });
}

export function getUserFollowers(req: Request, res: Response) {
    const targetID = parseInt(String(req.params.userID), 10);
    const page = parsePage(req.query.page);
    const limit = 20;
    const offset = (page - 1) * limit;
    const viewerID = req.user?.id ?? null;

    const user = userRepo.findVisibility(targetID);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!canViewProfile(viewerID, targetID, user.profileVisibility)) {
        return res.status(403).json({ message: "This profile is private" });
    }

    const rows = userRepo.findFollowers(viewerID, targetID, limit + 1, offset);

    const enriched = rows.slice(0, limit).map(({ isFollowedFlag, ...f }: any) => ({
        ...f,
        isFollowed: isFollowedFlag === 1,
    }));

    res.json({ followers: enriched, page, hasMore: rows.length > limit });
}

export function getUserFollowing(req: Request, res: Response) {
    const targetID = parseInt(String(req.params.userID), 10);
    const page = parsePage(req.query.page);
    const limit = 20;
    const offset = (page - 1) * limit;
    const viewerID = req.user?.id ?? null;

    const user = userRepo.findVisibility(targetID);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!canViewProfile(viewerID, targetID, user.profileVisibility)) {
        return res.status(403).json({ message: "This profile is private" });
    }

    const rows = userRepo.findFollowing(viewerID, targetID, limit + 1, offset);

    const enriched = rows.slice(0, limit).map(({ isFollowedFlag, ...f }: any) => ({
        ...f,
        isFollowed: isFollowedFlag === 1,
    }));

    res.json({ following: enriched, page, hasMore: rows.length > limit });
}
