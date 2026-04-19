import { Request, Response } from "express";
import * as db from "../database/db";

export function splitTags(tags: string | null): string[] {
    if (!tags) return [];
    try {
        return JSON.parse(tags);
    } catch {
        return tags.split(',').map(t => t.trim());
    }
}

export function getAllPins(req: Request, res: Response) {
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
            p.likes
		FROM pin p
		JOIN account a ON a.id = p.creatorID;
	`);
    res.json(results);
}

export function getUserPins(req: Request, res: Response) {
    const userID = req.user.id;
    const results = db.query(`
        SELECT
            id, creatorID, latitude, longitude, title, address, description, image, likes, tags
        FROM pin
        WHERE creatorID = ?;`, [
        userID,
    ]);
    res.json(results);
}

export function getPin(req: Request, res: Response) {
    const pinID = req.params.id;
    const results = db.query(`
        SELECT
            id, creatorID, latitude, longitude, title, address, description, image, likes, tags
        FROM pin
        WHERE id = ?`, [pinID]);
    if (results.length === 0) {
        return res.status(404).json({ message: "Pin not found" });
    }
    res.json(results);
}

export function createPin(req: Request, res: Response) {
    let tags = '[]';
    if (typeof req.body.tags === 'string') {
        tags = req.body.tags;
    } else if (req.body.tags) {
        tags = JSON.stringify(req.body.tags);
    }

    try {
        const results = db.query(`
		INSERT INTO pin(creatorID, latitude, longitude, title, address, description, image, tags, likes)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0)
		RETURNING id;
	`,
        [
            req.user.id,
            req.body.latitude,
            req.body.longitude,
            req.body.title ?? null,
            req.body.address ?? null,
            req.body.description ?? req.body.message ?? null,
            req.body.image ?? null,
            tags,
        ],
    );

    res.status(201).json(results[0]);
    } catch (e) {
        console.error('Create Pin Error:', e);
        res.status(400).json({ error: "Failed to create pin" });
    }
}

export function updatePin(req: Request, res: Response) {
    const pinID = req.params.id;
    const userID = req.user.id;
    const { title, address, description, image } = req.body;

    const pinResult = db.query("SELECT creatorID FROM pin WHERE id = ?", [pinID]);
    if (pinResult.length === 0) {
        return res.status(404).json({ message: "Pin not found" });
    }

    const pin = pinResult[0];

    if (Number(pin.creatorID) !== Number(userID)) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (description !== undefined) {
        updates.push("description = ?");
        params.push(description);
    }
    if (title !== undefined) {
        updates.push("title = ?");
        params.push(title);
    }
    if (image !== undefined) {
        updates.push("image = ?");
        params.push(image);
    }
    if (address !== undefined) {
        updates.push("address = ?");
        params.push(address);
    }

    if (updates.length > 0) {
        params.push(pinID);
        const sql = `UPDATE pin SET ${updates.join(", ")} WHERE id = ?`;
        db.query(sql, params);
    }

    const updatedPin = db.query(`
        SELECT
            id, creatorID, latitude, longitude, title, address, description, image, likes, tags
        FROM pin
        WHERE id = ?`, [pinID])[0];

    if (!updatedPin) {
        return res.status(404).json({ message: "Pin not found" });
    }

    res.json(updatedPin);
}

export function deletePin(req: Request, res: Response) {
    const pinID = req.params.id;
    const userID = req.user.id;

    const pinResult = db.query("SELECT creatorID FROM pin WHERE id = ?", [pinID]);
    if (pinResult.length === 0) {
        return res.status(404).send();
    }

    const pin = pinResult[0];

    if (Number(pin.creatorID) !== Number(userID)) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    db.query("DELETE FROM pin WHERE id = ?", [pinID]);
    res.status(200).send();
}

function haversine(theta: number) {
    return (1 - Math.cos(theta)) / 2;
}

function distBetweenCoordinates(lat1: number, lon1: number, lat2: number, lon2: number) {
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const lambda1 = (lon1 * Math.PI) / 180;
    const lambda2 = (lon2 * Math.PI) / 180;

    const deltaPhi = phi2 - phi1;
    const deltaLambda = lambda2 - lambda1;

    const haversineTheta =
        haversine(deltaPhi) +
        Math.cos(phi1) * Math.cos(phi2) * haversine(deltaLambda);
    const theta = 2 * Math.asin(Math.sqrt(haversineTheta));

    return theta * 6371.2;
}

export function getPinsNearCoordinate(req: Request, res: Response) {
    const latitude = req.body.latitude;
    const longitude = req.body.longitude;
    const MAX_RADIUS_KM = 10;

    const results: any[] = db.query(`SELECT * FROM pin;`);
    const filtered = results
        .map((p: any) => {
            return {
                ...p,
                distance: distBetweenCoordinates(
                    p.latitude,
                    p.longitude,
                    latitude,
                    longitude,
                ),
            };
        })
        .sort((a: any, b: any) => {
            return a.distance - b.distance;
        })
        .filter((d: any) => d.distance < MAX_RADIUS_KM)
        .map((c: any) => {
            const { distance, ...everythingElse } = c;
            return everythingElse;
        });

    res.json(filtered);
}
