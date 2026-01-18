import { Request, Response } from "express";
import * as db from "../database/db";

export function getLikes(req: Request, res: Response) {
    const results = db.query(`SELECT likes FROM pin WHERE id = ?;`, [req.params.id]);
	if (results.length == 0) {
		return res.status(404).send();
	}

    res.json(results[0].likes);
}

export function addLikes(req: Request, res: Response) {
    const results = db.query(`
		UPDATE pin 
		SET likes = likes + 1 
		WHERE id = ?;`, 
	[req.params.id]);
	
	if (results.changes == 0) {
		return res.status(404).send();
	}

    res.status(204).send();
}

