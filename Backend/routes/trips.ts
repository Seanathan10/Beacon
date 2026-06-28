import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database/db";
import { logError } from "../utils/logger";
import { sanitizeDeep, stripHtml } from "../utils/sanitize";
import { deriveTripCarbon } from "../utils/tripCarbon";

const MAX_CURSOR = Number.MAX_SAFE_INTEGER; // safely covers any realistic rowid
const PAGE_LIMIT = 20;
const MAX_DRAFT_PAYLOAD_BYTES = 512 * 1024; // 512 KB, mirrors /api/share

interface TripSummary {
    origin: string | null;
    destination: string | null;
    itineraryType: string | null;
    durationDays: number | null;
}

/**
 * Pull a lightweight summary out of the stored itinerary blob so the My Trips
 * list can render cards without shipping the full (potentially large) payload.
 * Defensive: the blob is user/AI-derived, so never trust its shape.
 */
function summarize(data: string): TripSummary {
    const empty: TripSummary = { origin: null, destination: null, itineraryType: null, durationDays: null };
    try {
        const parsed = JSON.parse(data);
        const settings = parsed?.settings ?? {};
        const days = Number(settings.durationDays);
        return {
            origin: typeof settings.origin === "string" ? settings.origin : null,
            destination: typeof settings.destination === "string" ? settings.destination : null,
            itineraryType: typeof parsed?.itineraryType === "string" ? parsed.itineraryType : null,
            durationDays: Number.isFinite(days) ? days : null,
        };
    } catch {
        return empty;
    }
}

/**
 * GET /api/me/trips — cursor-paginated list of the viewer's own itineraries
 * (both private drafts and published snapshots), newest first. Paginated by
 * rowid so the cursor stays stable even though the primary key is a UUID.
 */
export function getMyTrips(req: Request, res: Response) {
    const userID = req.user.id;

    let cursor: number | null = null;
    if (req.query.cursor !== undefined) {
        const parsed = parseInt(req.query.cursor as string, 10);
        if (isNaN(parsed) || parsed < 1 || parsed > MAX_CURSOR) {
            return res.status(400).json({ message: "Invalid cursor" });
        }
        cursor = parsed;
    }

    try {
        const rows: any[] = cursor
            ? db.prepare(`
                SELECT rowid AS _rowid, id, title, isPublic, data, createdAt
                FROM itinerary
                WHERE creatorID = ? AND rowid < ?
                ORDER BY rowid DESC
                LIMIT ?
              `).all(userID, cursor, PAGE_LIMIT + 1)
            : db.prepare(`
                SELECT rowid AS _rowid, id, title, isPublic, data, createdAt
                FROM itinerary
                WHERE creatorID = ?
                ORDER BY rowid DESC
                LIMIT ?
              `).all(userID, PAGE_LIMIT + 1);

        const hasMore = rows.length > PAGE_LIMIT;
        const page = rows.slice(0, PAGE_LIMIT);
        const items = page.map((r) => ({
            id: r.id,
            title: r.title ?? null,
            isPublic: r.isPublic === 1,
            createdAt: r.createdAt,
            summary: summarize(r.data),
        }));
        const nextCursor = hasMore ? page[page.length - 1]._rowid : null;

        res.json({ items, nextCursor, hasMore });
    } catch (err) {
        logError(req, "List trips error", err);
        res.status(500).json({ message: "Failed to list trips" });
    }
}

/**
 * GET /api/me/trips/:id — fetch one of the viewer's own trips in full, including
 * the complete itinerary blob. Owner-only: a non-owner (or unknown id) gets 404
 * so the route never reveals the existence of another user's private draft.
 */
export function getMyTrip(req: Request, res: Response) {
    const userID = req.user.id;
    const id = String(req.params.id);

    try {
        const row = db.prepare(
            "SELECT id, creatorID, title, data, isPublic, createdAt FROM itinerary WHERE id = ?"
        ).get(id) as { id: string; creatorID: number | null; title: string | null; data: string; isPublic: number; createdAt: string } | undefined;

        if (!row || row.creatorID !== Number(userID)) {
            return res.status(404).json({ message: "Trip not found" });
        }

        const createdAt = row.createdAt
            ? new Date(row.createdAt.replace(" ", "T") + "Z").toISOString()
            : new Date().toISOString();

        res.json({
            id: row.id,
            title: row.title ?? null,
            isPublic: row.isPublic === 1,
            createdAt,
            ...JSON.parse(row.data),
        });
    } catch (err) {
        logError(req, "Get trip error", err);
        res.status(500).json({ message: "Failed to fetch trip" });
    }
}

/**
 * POST /api/trip/save — persist a private draft (isPublic = 0) without publishing.
 * With no `id` it creates a new draft; with an `id` it updates an existing draft
 * the viewer owns. Published snapshots (isPublic = 1) are immutable and cannot be
 * overwritten here — clients must share again to produce a new public snapshot.
 */
export function saveTrip(req: Request, res: Response) {
    const userID = req.user.id;
    const { id, itinerary, itineraryType, settings, title } = req.body ?? {};

    if (!itinerary) {
        return res.status(400).json({ message: "Missing itinerary data" });
    }

    const data = JSON.stringify({
        itinerary: sanitizeDeep(itinerary),
        itineraryType: typeof itineraryType === "string" ? stripHtml(itineraryType) : itineraryType,
        settings: sanitizeDeep(settings || {}),
    });

    if (Buffer.byteLength(data, "utf8") > MAX_DRAFT_PAYLOAD_BYTES) {
        return res.status(413).json({ message: "Itinerary payload too large" });
    }

    const cleanTitle = typeof title === "string"
        ? stripHtml(title).trim().slice(0, 120) || null
        : null;
    const { carbonKg, savedKg } = deriveTripCarbon(settings);

    try {
        if (id !== undefined && id !== null) {
            const tripId = String(id);
            const existing = db.prepare(
                "SELECT creatorID, isPublic FROM itinerary WHERE id = ?"
            ).get(tripId) as { creatorID: number | null; isPublic: number } | undefined;

            if (!existing || existing.creatorID !== Number(userID)) {
                return res.status(404).json({ message: "Trip not found" });
            }
            if (existing.isPublic === 1) {
                return res.status(409).json({ message: "Published trips are immutable" });
            }

            db.prepare(
                "UPDATE itinerary SET title = ?, data = ?, carbonKg = ?, savedKg = ? WHERE id = ? AND creatorID = ?"
            ).run(cleanTitle, data, carbonKg, savedKg, tripId, Number(userID));

            return res.status(200).json({ id: tripId, isPublic: false });
        }

        const newId = uuidv4();
        db.prepare(
            "INSERT INTO itinerary (id, creatorID, title, data, isPublic, carbonKg, savedKg) VALUES (?, ?, ?, ?, 0, ?, ?)"
        ).run(newId, Number(userID), cleanTitle, data, carbonKg, savedKg);

        res.status(201).json({ id: newId, isPublic: false });
    } catch (err) {
        logError(req, "Save trip error", err);
        res.status(500).json({ message: "Failed to save trip" });
    }
}
