import { Request, Response } from "express";
import * as db from "../database/db";

const MAX_TITLE_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 5000;

function stripHtml(str: string): string {
    return str.replace(/<[^>]*>/g, '');
}

function isValidUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return ['http:', 'https:'].includes(urlObj.protocol);
    } catch {
        return false;
    }
}

export function splitTags(tags: string | null): string[] {
    if (!tags) return [];
    try {
        return JSON.parse(tags);
    } catch {
        return tags.split(',').map(t => t.trim());
    }
}

export function getAllPins(req: Request, res: Response) {
    const userID = req.user?.id ?? null;
    const sort = typeof req.query.sort === "string" ? req.query.sort : "";

    const results: any[] = db.query(`
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
			(SELECT COUNT(*) FROM likes WHERE pinID = p.id) AS likes,
			(SELECT status FROM pin_status WHERE pinID = p.id AND accountID = ?) AS userStatus
		FROM pin p
		JOIN account a ON a.id = p.creatorID;
	`, [userID]);

    if (sort === "distance") {
        const lat = parseFloat(req.query.lat as string);
        const lng = parseFloat(req.query.lng as string);
        if (
            !isNaN(lat) && !isNaN(lng) &&
            lat >= -90 && lat <= 90 &&
            lng >= -180 && lng <= 180
        ) {
            const sorted = results
                .map((p) => ({
                    ...p,
                    _distance: distBetweenCoordinates(p.latitude, p.longitude, lat, lng),
                }))
                .sort((a, b) => a._distance - b._distance)
                .map(({ _distance: _d, ...rest }) => rest);
            return res.json(sorted);
        }
    }

    res.json(results);
}

export function getTrendingPins(req: Request, res: Response) {
    const userID = req.user?.id ?? null;
    const daysRaw = parseInt(String(req.query.days ?? "7"), 10);
    const days = isNaN(daysRaw) || daysRaw <= 0 ? 7 : Math.min(daysRaw, 365);

    // trendingScore = likes + 3 * max(0, 1 - age_days / days)
    // Pins outside the window still appear but with recencyScore 0.
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
            (SELECT COUNT(*) FROM likes WHERE pinID = p.id) AS likes,
            (SELECT status FROM pin_status WHERE pinID = p.id AND accountID = ?) AS userStatus,
            ((SELECT COUNT(*) FROM likes WHERE pinID = p.id)
                + 3.0 * MAX(
                    0.0,
                    1.0 - (julianday('now') - julianday(p.createdAt)) / CAST(? AS REAL)
                )
            ) AS trendingScore
        FROM pin p
        JOIN account a ON a.id = p.creatorID
        ORDER BY trendingScore DESC, p.createdAt DESC
        LIMIT 20;
    `, [userID, days]);

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
    const lat = parseFloat(req.body.latitude);
    const lng = parseFloat(req.body.longitude);
    if (
        isNaN(lat) || isNaN(lng) ||
        lat < -90 || lat > 90 ||
        lng < -180 || lng > 180
    ) {
        return res.status(400).json({ error: "Invalid coordinates" });
    }

    const title = req.body.title ? stripHtml(String(req.body.title).trim()) : null;
    if (title && title.length > MAX_TITLE_LENGTH) {
        return res.status(400).json({ error: `Title must be ${MAX_TITLE_LENGTH} characters or less` });
    }

    const address = req.body.address ? stripHtml(String(req.body.address).trim()) : null;
    if (address && address.length > MAX_ADDRESS_LENGTH) {
        return res.status(400).json({ error: `Address must be ${MAX_ADDRESS_LENGTH} characters or less` });
    }

    const description = req.body.description || req.body.message;
    const descriptionStr = description ? stripHtml(String(description).trim()) : null;
    if (descriptionStr && descriptionStr.length > MAX_DESCRIPTION_LENGTH) {
        return res.status(400).json({ error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less` });
    }

    let image = null;
    if (req.body.image) {
        image = String(req.body.image).trim();
        if (!isValidUrl(image)) {
            return res.status(400).json({ error: "Invalid image URL" });
        }
    }

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
                lat,
                lng,
                title,
                address,
                descriptionStr,
                image,
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
    if (Number(pinResult[0].creatorID) !== Number(userID)) {
        return res.status(403).json({ message: "Forbidden" });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (description !== undefined) {
        const descStr = stripHtml(String(description).trim());
        if (descStr.length > MAX_DESCRIPTION_LENGTH) {
            return res.status(400).json({ error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less` });
        }
        updates.push("description");
        params.push(descStr);
    }

    if (title !== undefined) {
        const titleStr = stripHtml(String(title).trim());
        if (titleStr.length > MAX_TITLE_LENGTH) {
            return res.status(400).json({ error: `Title must be ${MAX_TITLE_LENGTH} characters or less` });
        }
        updates.push("title");
        params.push(titleStr);
    }

    if (image !== undefined) {
        if (image) {
            const imageStr = String(image).trim();
            if (!isValidUrl(imageStr)) {
                return res.status(400).json({ error: "Invalid image URL" });
            }
            updates.push("image");
            params.push(imageStr);
        } else {
            updates.push("image");
            params.push(null);
        }
    }

    if (address !== undefined) {
        const addressStr = stripHtml(String(address).trim());
        if (addressStr.length > MAX_ADDRESS_LENGTH) {
            return res.status(400).json({ error: `Address must be ${MAX_ADDRESS_LENGTH} characters or less` });
        }
        updates.push("address");
        params.push(addressStr);
    }

    if (updates.length > 0) {
        const updateClauses = updates.map((field) => `${field} = ?`).join(', ');
        params.push(pinID);
        const sql = `UPDATE pin SET ${updateClauses} WHERE id = ?`;
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
    if (Number(pinResult[0].creatorID) !== Number(userID)) {
        return res.status(403).json({ message: "Forbidden" });
    }

    const result = db.query("DELETE FROM pin WHERE id = ?", [pinID]);
    if (result.changes === 0) {
        return res.status(404).send();
    }
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
    const latitude = parseFloat(req.body.latitude);
    const longitude = parseFloat(req.body.longitude);
    const MAX_RADIUS_KM = 10;

    if (
        isNaN(latitude) || isNaN(longitude) ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180
    ) {
        return res.status(400).json({ error: "Invalid coordinates" });
    }

    // Bounding box pre-filter to avoid loading all pins into memory
    const latDelta = MAX_RADIUS_KM / 111.0;
    const lngDelta = MAX_RADIUS_KM / (111.0 * Math.cos(latitude * Math.PI / 180));

    const results: any[] = db.query(
        `SELECT * FROM pin WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`,
        [latitude - latDelta, latitude + latDelta, longitude - lngDelta, longitude + lngDelta]
    );

    const filtered = results
        .map((p: any) => ({
            ...p,
            distance: distBetweenCoordinates(p.latitude, p.longitude, latitude, longitude),
        }))
        .filter((d: any) => d.distance < MAX_RADIUS_KM)
        .sort((a: any, b: any) => a.distance - b.distance)
        .map(({ distance: _d, ...rest }: any) => rest);

    res.json(filtered);
}

