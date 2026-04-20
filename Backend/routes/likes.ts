import { Request, Response } from "express";
import * as db from "../database/db";

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
        console.error("Like error:", error);
        res.status(500).send();
    }
}

export function removeLike(req: Request, res: Response) {
    const results = db.query(`DELETE FROM likes WHERE pinID = ? AND accountID = ?;`, [req.params.id, req.user.id]);

	if (results.changes === 0) {
		return res.status(404).send();
	}

    res.status(204).send();
}

