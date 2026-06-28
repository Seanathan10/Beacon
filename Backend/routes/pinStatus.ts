import { Request, Response } from "express";
import * as db from "../database/db";
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

    const pin = db.query("SELECT id FROM pin WHERE id = ?", [pinID]);
    if (pin.length === 0) {
        return res.status(404).json({ message: "Pin not found" });
    }

    // Capture the prior status so we only credit a challenge the first time a
    // pin actually transitions into 'visited' (toggling back and forth or
    // re-saving 'visited' must not inflate progress).
    const prior = db.query(
        "SELECT status FROM pin_status WHERE pinID = ? AND accountID = ?",
        [pinID, userID],
    )[0] as { status: string } | undefined;

    db.query(
        `INSERT INTO pin_status (pinID, accountID, status, updatedAt)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(pinID, accountID) DO UPDATE SET
            status = excluded.status,
            updatedAt = CURRENT_TIMESTAMP`,
        [pinID, userID, status],
    );

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

    const result = db.query(
        `DELETE FROM pin_status WHERE pinID = ? AND accountID = ?`,
        [pinID, userID],
    );

    if (!result.changes) {
        return res.status(404).json({ message: "Status not set for this pin" });
    }

    res.status(204).send();
}

export function getUserPinStatuses(req: Request, res: Response) {
    const userID = req.user.id;
    const results = db.query(
        `SELECT pinID, status, updatedAt FROM pin_status WHERE accountID = ?`,
        [userID],
    );
    res.json(results);
}
