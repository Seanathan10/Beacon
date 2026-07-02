import { Request, Response } from "express";
import * as db from "../database/db";
import * as pinRepo from "../repositories/pinRepo";
import { logError } from "../utils/logger";
import { visibilityFilter } from "../utils/visibility";
import { stripHtml } from "../utils/sanitize";

const MAX_TITLE_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_TAGS_LENGTH = 200;

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

    // Filter params
    // tags arrives as string[] from the OpenAPI validator (style: form, explode: true)
    const rawTags = req.query.tags;
    const tags: string[] = Array.isArray(rawTags)
        ? (rawTags as string[]).map(t => t.trim()).filter(Boolean)
        : typeof rawTags === "string" ? rawTags.split(',').map(t => t.trim()).filter(Boolean)
        : [];
    const minDate = typeof req.query.minDate === "string" ? req.query.minDate.trim() : "";
    const maxDate = typeof req.query.maxDate === "string" ? req.query.maxDate.trim() : "";
    const minRating = req.query.minRating !== undefined ? parseInt(String(req.query.minRating), 10) : null;
    const maxRating = req.query.maxRating !== undefined ? parseInt(String(req.query.maxRating), 10) : null;
    const bookmarkStatus = typeof req.query.bookmarkStatus === "string" ? req.query.bookmarkStatus : "";
    const creatorIDRaw = req.query.creatorID !== undefined ? parseInt(String(req.query.creatorID), 10) : null;
    const creatorID = creatorIDRaw !== null && !isNaN(creatorIDRaw) ? creatorIDRaw : null;

    if (bookmarkStatus && !userID) {
        return res.status(401).json({ error: "Authentication required for bookmarkStatus filter" });
    }

    // Build WHERE clause dynamically; params[0] is always userID for the userStatus subquery
    const conditions: string[] = [];
    const params: any[] = [userID];

    if (tags.length > 0) {
        conditions.push(`(${tags.map(() => "p.tags LIKE ?").join(" OR ")})`);
        tags.forEach(t => params.push(`%${t}%`));
    }

    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (minDate && DATE_RE.test(minDate)) {
        conditions.push("p.createdAt >= ?");
        params.push(minDate);
    }
    if (maxDate && DATE_RE.test(maxDate)) {
        conditions.push("p.createdAt <= ?");
        params.push(maxDate + " 23:59:59");
    }

    if (creatorID !== null) {
        conditions.push("p.creatorID = ?");
        params.push(creatorID);
    }

    if (bookmarkStatus === 'bookmarked') {
        conditions.push("EXISTS (SELECT 1 FROM bookmark WHERE pinID = p.id AND accountID = ?)");
        params.push(userID);
    } else if (bookmarkStatus === 'visited' || bookmarkStatus === 'wishlist') {
        conditions.push("EXISTS (SELECT 1 FROM pin_status WHERE pinID = p.id AND accountID = ? AND status = ?)");
        params.push(userID, bookmarkStatus);
    }

    // Only return pins whose creator's profileVisibility allows this viewer.
    const vis = visibilityFilter(userID, "a", "p.creatorID");
    conditions.push(vis.sql);
    params.push(...vis.params);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    let sql = `
        SELECT
            p.id,
            p.creatorID,
            COALESCE(a.email, '') AS email,
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
        LEFT JOIN account a ON a.id = p.creatorID
        ${whereClause}
    `;

    // Wrap in outer query to filter by the computed likes count (minRating / maxRating)
    const validMin = minRating !== null && !isNaN(minRating);
    const validMax = maxRating !== null && !isNaN(maxRating);
    if (validMin || validMax) {
        const ratingConds: string[] = [];
        if (validMin) { ratingConds.push("likes >= ?"); params.push(minRating); }
        if (validMax) { ratingConds.push("likes <= ?"); params.push(maxRating); }
        sql = `SELECT * FROM (${sql}) WHERE ${ratingConds.join(" AND ")}`;
    }

    const results: any[] = db.query(sql, params);

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
    const vis = visibilityFilter(userID, "a", "p.creatorID");
    const results = db.query(`
        SELECT
            p.id,
            p.creatorID,
            COALESCE(a.email, '') AS email,
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
        LEFT JOIN account a ON a.id = p.creatorID
        WHERE ${vis.sql}
        ORDER BY trendingScore DESC, p.createdAt DESC
        LIMIT 20;
    `, [userID, days, ...vis.params]);

    res.json(results);
}

export function getUserPins(req: Request, res: Response) {
    const userID = req.user.id;
    res.json(pinRepo.findByCreator(userID));
}

export function getPin(req: Request, res: Response) {
    const pinID = String(req.params.id);
    const results = pinRepo.findById(pinID);
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

    // tags is stored in a VARCHAR(200) column; reject oversized input instead of
    // letting SQLite silently truncate it.
    if (tags.length > MAX_TAGS_LENGTH) {
        return res.status(400).json({ error: `Tags must be ${MAX_TAGS_LENGTH} characters or less` });
    }

    try {
        const created = pinRepo.insert({
            creatorID: req.user.id,
            latitude: lat,
            longitude: lng,
            title,
            address,
            description: descriptionStr,
            image,
            tags,
        });

        res.status(201).json(created);
    } catch (e) {
        logError(req, 'Create Pin Error', e);
        res.status(400).json({ error: "Failed to create pin" });
    }
}

export function updatePin(req: Request, res: Response) {
    const pinID = String(req.params.id);
    const userID = req.user.id;
    const { title, address, description, image } = req.body;

    const owner = pinRepo.findOwner(pinID);
    if (!owner || Number(owner.creatorID) !== Number(userID)) {
        return res.status(404).json({ message: "Pin not found" });
    }

    const fields: Record<string, unknown> = {};

    if (description !== undefined) {
        const descStr = stripHtml(String(description).trim());
        if (descStr.length > MAX_DESCRIPTION_LENGTH) {
            return res.status(400).json({ error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less` });
        }
        fields.description = descStr;
    }

    if (title !== undefined) {
        const titleStr = stripHtml(String(title).trim());
        if (titleStr.length > MAX_TITLE_LENGTH) {
            return res.status(400).json({ error: `Title must be ${MAX_TITLE_LENGTH} characters or less` });
        }
        fields.title = titleStr;
    }

    if (image !== undefined) {
        if (image) {
            const imageStr = String(image).trim();
            if (!isValidUrl(imageStr)) {
                return res.status(400).json({ error: "Invalid image URL" });
            }
            fields.image = imageStr;
        } else {
            fields.image = null;
        }
    }

    if (address !== undefined) {
        const addressStr = stripHtml(String(address).trim());
        if (addressStr.length > MAX_ADDRESS_LENGTH) {
            return res.status(400).json({ error: `Address must be ${MAX_ADDRESS_LENGTH} characters or less` });
        }
        fields.address = addressStr;
    }

    pinRepo.update(pinID, fields);

    const updatedPin = pinRepo.findById(pinID)[0];

    if (!updatedPin) {
        return res.status(404).json({ message: "Pin not found" });
    }

    res.json(updatedPin);
}

export function deletePin(req: Request, res: Response) {
    const pinID = String(req.params.id);
    const userID = req.user.id;

    const owner = pinRepo.findOwner(pinID);
    if (!owner || Number(owner.creatorID) !== Number(userID)) {
        return res.status(404).send();
    }

    const result = pinRepo.deleteById(pinID);
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

export function getSimilarPins(req: Request, res: Response) {
    const pinID = String(req.params.id);
    const userID = req.user?.id ?? null;

    const pin = db.query("SELECT id FROM pin WHERE id = ?", [pinID])[0];
    if (!pin) return res.status(404).json({ message: "Pin not found" });

    // Find pins that users who liked this pin also liked, respecting the
    // creator's profileVisibility (private/friends honoured for this viewer).
    const vis = visibilityFilter(userID, "a", "p.creatorID");
    const results = db.query(`
        SELECT
            p.id, p.creatorID, a.email, p.latitude, p.longitude,
            p.title, p.address, p.description, p.image, p.tags, p.createdAt,
            (SELECT COUNT(*) FROM likes WHERE pinID = p.id) AS likes,
            COUNT(*) AS sharedLikers
        FROM likes l1
        JOIN likes l2 ON l2.accountID = l1.accountID AND l2.pinID != ?
        JOIN pin p ON p.id = l2.pinID
        JOIN account a ON a.id = p.creatorID
        WHERE l1.pinID = ? AND ${vis.sql}
        GROUP BY p.id
        ORDER BY sharedLikers DESC, likes DESC
        LIMIT 10
    `, [pinID, pinID, ...vis.params]);

    res.json(results);
}

export function getPinsNearCoordinate(req: Request, res: Response) {
    const latitude = parseFloat(req.body.latitude);
    const longitude = parseFloat(req.body.longitude);
    const MAX_RADIUS_KM = 10;
    const userID = req.user?.id ?? null;

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
    const vis = visibilityFilter(userID, "a", "p.creatorID");

    const results: any[] = db.query(
        `
        SELECT
            p.id,
            p.creatorID,
            COALESCE(a.email, '') AS email,
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
        LEFT JOIN account a ON a.id = p.creatorID
        WHERE p.latitude BETWEEN ? AND ?
          AND p.longitude BETWEEN ? AND ?
          AND ${vis.sql}
        `,
        [
            userID,
            latitude - latDelta,
            latitude + latDelta,
            longitude - lngDelta,
            longitude + lngDelta,
            ...vis.params,
        ]
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
