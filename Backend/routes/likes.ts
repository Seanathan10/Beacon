import { Request, Response } from "express";
import * as likeRepo from "../repositories/likeRepo";
import * as pinRepo from "../repositories/pinRepo";
import { logError } from "../utils/logger";
import { createNotification } from "../services/notifications";

export function getLikes(req: Request, res: Response) {
    const pinID = String(req.params.id);
    const status = likeRepo.getLikeStatus(pinID, req.user.id);
    if (!status) {
        return res.status(404).send();
    }

    res.json({
        likes: status.likes,
        wasLiked: status.wasLiked === 1,
    });
}

export function addLike(req: Request, res: Response) {
    const pinID = String(req.params.id);
    try {
        // Insert the like and bump the denormalized counter atomically so the
        // pin.likes column can never drift from the authoritative likes table.
        const result = likeRepo.addLike(pinID, req.user.id);

        // This won't be reached if duplicate (throws error)
        if (result.changes === 0) {
            return res.status(404).send();
        }

        // Notify the pin's creator that someone liked their pin (best-effort).
        const pin = pinRepo.findOwner(pinID);
        if (pin?.creatorID != null) {
            createNotification({
                recipientID: Number(pin.creatorID),
                actorID: req.user.id,
                type: "pin_like",
                entityType: "pin",
                entityID: Number(pinID),
            });
        }

        res.status(204).send();
    } catch (error: any) {
        // SQLite unique constraint violation has code 'SQLITE_CONSTRAINT' or similar,
        // usually includes "UNIQUE constraint failed" in message for node:sqlite
        if (error.code === 'SQLITE_CONSTRAINT' || error.message?.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ message: "Already liked" });
        }
        // If foreign key failed (Pin not found)
        if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || error.message?.includes('FOREIGN KEY constraint failed')) {
            return res.status(404).json({ message: "Pin not found" });
        }
        // Generic 500 otherwise
        logError(req, "Like error", error);
        res.status(500).send();
    }
}

export function removeLike(req: Request, res: Response) {
    const pinID = String(req.params.id);
    // Delete the like and decrement the denormalized counter atomically.
    const result = likeRepo.removeLike(pinID, req.user.id);

    if (result.changes === 0) {
        return res.status(404).send();
    }

    res.status(204).send();
}

/**
 * GET /api/likes/user - Get all pins liked by the authenticated user
 */
export function getLikedPins(req: Request, res: Response) {
    if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    res.json(likeRepo.findLikedPins(req.user.id));
}
