import { Request, Response } from 'express';
import * as db from '../database/db';

export function getAllPins(req: Request, res: Response) {
	try {
		console.log("[getAllPins] User:", req.user);
		const results = db.query(`SELECT * FROM pin WHERE creatorID = ?;`, [req.user.id]);
		console.log("[getAllPins] Results:", results);
		res.json(results);
	} catch (error) {
		console.error("[getAllPins] Error:", error);
		res.status(500).json({ message: "Failed to fetch pins", error: String(error) });
	}
}

export function getPin(req: Request, res: Response) {
	const pinID = req.params.id;
	const results = db.query(`SELECT * FROM pin WHERE id = ?`, [pinID]);
	res.json(results);
}

export function createPin(req: Request, res: Response) {
	const results = db.query(`
		INSERT INTO pin(creatorID, message, image, color)
		VALUES(?, ?, ?, ?)
		RETURNING id;
	`, [
		req.user.id, 
		req.body.message ?? null,
		req.body.image ?? null,
		req.body.color ?? null
	]);

	res.json(results[0]);
}

export function deletePin(req: Request, res: Response) {
	const pinID = req.params.id;
	const result = db.query('DELETE FROM pin WHERE id = ?', [pinID]);
	if (result.changes === 0)
		res.status(404).send()
	else
		res.status(200).send();
}