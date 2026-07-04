import { Request, Response } from "express";
import * as pinRepo from "../repositories/pinRepo";
import { logError } from "../utils/logger";
import { stripHtml, isValidUrl } from "../utils/sanitize";
import { isOwner } from "../utils/ownership";

const MAX_TITLE_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_TAGS_LENGTH = 200;

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

    // Data access (dynamic WHERE building + SQL) lives in the repository; the
    // controller only parses the request and does the JS distance sort below.
    const results: any[] = pinRepo.search({
        userID,
        tags,
        minDate,
        maxDate,
        minRating,
        maxRating,
        bookmarkStatus,
        creatorID,
    });

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
    res.json(pinRepo.findTrending(userID, days));
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
    if (!owner || !isOwner(owner.creatorID, userID)) {
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
    if (!owner || !isOwner(owner.creatorID, userID)) {
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

    if (!pinRepo.existsById(pinID)) return res.status(404).json({ message: "Pin not found" });

    // Find pins that users who liked this pin also liked, respecting the
    // creator's profileVisibility (private/friends honoured for this viewer).
    res.json(pinRepo.findSimilar(pinID, userID));
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

    const results: any[] = pinRepo.findInBoundingBox(
        userID,
        latitude - latDelta,
        latitude + latDelta,
        longitude - lngDelta,
        longitude + lngDelta,
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
