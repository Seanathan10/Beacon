import { Request, Response } from "express";
import * as db from "../database/db";
import { logError } from "../utils/logger";

export function getLikes(req: Request, res: Response) {
	const results = db.query(`
		SELECT
			(SELECT COUNT(*) FROM likes WHERE pinID = ?) AS likes,
			EXISTS (SELECT 1 FROM likes WHERE accountID = ? AND pinID = ?) AS wasLiked
		FROM pin p
		WHERE p.id = ?;
	`, [req.params.id, req.user.id, req.params.id, req.params.id]);
    if (results.length === 0) {
        return res.status(404).send();
    }

    res.json({
		likes: results[0].likes,
		wasLiked: results[0].wasLiked === 1
	});
}

export function addLike(req: Request, res: Response) {
    try {
        const results = db.query(`INSERT INTO likes(pinID, accountID) VALUES(?, ?);`, [req.params.id, req.user.id]);

        // This won't be reached if duplicate (throws error)
        if (results.changes === 0) {
            return res.status(404).send();
        }

        // Keep the denormalized pin.likes counter in sync with the likes table.
        db.query(`UPDATE pin SET likes = likes + 1 WHERE id = ?;`, [req.params.id]);

        res.status(204).send();
    } catch (error: any) {
        // SQLite unique constraint violation has code 'SQLITE_CONSTRAINT_UNIQUE' or similar, 
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
    const results = db.query(`DELETE FROM likes WHERE pinID = ? AND accountID = ?;`, [req.params.id, req.user.id]);

	if (results.changes === 0) {
		return res.status(404).send();
	}

    // Keep the denormalized pin.likes counter in sync (clamp at 0 defensively).
    db.query(`UPDATE pin SET likes = MAX(0, likes - 1) WHERE id = ?;`, [req.params.id]);

    res.status(204).send();
}

/**
 * GET /api/likes/user - Get all pins liked by the authenticated user
 */
export function getLikedPins(req: Request, res: Response) {
	if (!req.user?.id) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	const results = db.query(`
		SELECT
			p.id,
			p.creatorID,
			a.email,
			p.latitude,
			p.longitude,
			p.title,
			p.address,
			p.description,
			p.image,
			p.tags,
			p.createdAt,
			(SELECT COUNT(*) FROM likes WHERE pinID = p.id) AS likes
		FROM likes l
		JOIN pin p ON p.id = l.pinID
		JOIN account a ON a.id = p.creatorID
		WHERE l.accountID = ?
		ORDER BY p.createdAt DESC
	`, [req.user.id]);

	res.json(results);
}