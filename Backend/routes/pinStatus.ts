import { Request, Response } from "express";
import * as pinStatusRepo from "../repositories/pinStatusRepo";
import * as pinRepo from "../repositories/pinRepo";
import { recordChallengeEvent } from "../services/challenges";

const VALID_STATUSES = new Set(["visited", "wishlist"]);

export function setPinStatus(req: Request, res: Response) {
    const pinID = parseInt(String(req.params.id), 10);
    const userID = req.user.id;
    const status = req.body?.status;

    if (isNaN(pinID)) {
        return res.status(400).json({ error: "Invalid pin id" });
    }
    if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
        return res.status(400).json({ error: "Invalid status. Expected 'visited' or 'wishlist'." });
    }

    if (!pinRepo.existsById(pinID)) {
        return res.status(404).json({ message: "Pin not found" });
    }

    // Capture the prior status so we only credit a challenge the first time a
    // pin actually transitions into 'visited' (toggling back and forth or
    // re-saving 'visited' must not inflate progress).
    const prior = pinStatusRepo.findStatus(pinID, userID);

    pinStatusRepo.upsertStatus(pinID, userID, status);

    if (status === "visited" && prior?.status !== "visited") {
        recordChallengeEvent(userID, "places_visited", 1);
    }

    res.status(200).json({ pinID, status });
}

export function deletePinStatus(req: Request, res: Response) {
    const pinID = parseInt(String(req.params.id), 10);
    const userID = req.user.id;

    if (isNaN(pinID)) {
        return res.status(400).json({ error: "Invalid pin id" });
    }

    const result = pinStatusRepo.deleteStatus(pinID, userID);

    if (!result.changes) {
        return res.status(404).json({ message: "Status not set for this pin" });
    }

    res.status(204).send();
}

export function getUserPinStatuses(req: Request, res: Response) {
    const userID = req.user.id;
    res.json(pinStatusRepo.findAllForUser(userID));
}
