import { Request, Response } from "express";
import * as followRepo from "../repositories/followRepo";
import * as userRepo from "../repositories/userRepo";
import { logError } from "../utils/logger";
import { parseCursor } from "../utils/pagination";
import { createNotification } from "../services/notifications";

const MAX_CURSOR = 2_147_483_647; // upper bound for a pin ID cursor

export function followUser(req: Request, res: Response) {
    const followerID = req.user.id;
    const followingID = parseInt(String(req.params.userID), 10);

    if (followerID === followingID) {
        return res.status(400).json({ message: "Cannot follow yourself" });
    }

    if (!userRepo.exists(followingID)) return res.status(404).json({ message: "User not found" });

    // Idempotent, but we no longer use INSERT OR IGNORE — that would also swallow
    // genuine constraint/schema errors and report success. Instead we explicitly
    // treat an existing relationship (or a UNIQUE race) as success and surface
    // anything else as a 500.
    if (userRepo.isFollowing(followerID, followingID)) {
        return res.status(204).send();
    }

    try {
        followRepo.insertFollow(followerID, followingID);
        // Notify the followed user (best-effort).
        createNotification({
            recipientID: followingID,
            actorID: followerID,
            type: "follow",
            entityType: "account",
            entityID: followerID,
        });
        res.status(204).send();
    } catch (err: any) {
        if (err.code === 'SQLITE_CONSTRAINT' || err.message?.includes('UNIQUE constraint failed')) {
            return res.status(204).send(); // concurrent follow — already following
        }
        logError(req, "Follow error", err);
        res.status(500).json({ message: "Failed to follow user" });
    }
}

export function unfollowUser(req: Request, res: Response) {
    const followerID = req.user.id;
    const followingID = parseInt(String(req.params.userID), 10);

    const result = followRepo.deleteFollow(followerID, followingID);

    if (result.changes === 0) {
        return res.status(404).json({ message: "Not following this user" });
    }
    res.status(204).send();
}

export function getFollowFeed(req: Request, res: Response) {
    const userID = req.user.id;

    const cursor = parseCursor(req.query.cursor, MAX_CURSOR);
    if (cursor === "invalid") {
        return res.status(400).json({ message: "Invalid cursor" });
    }
    const limit = 10;

    const rows = followRepo.findFeed(userID, cursor, limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    res.json({ items, nextCursor, hasMore });
}
