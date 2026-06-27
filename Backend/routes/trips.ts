import { Request, Response } from "express";
import { db } from "../database/db";
import { logError } from "../utils/logger";

const MAX_CURSOR = 9_223_372_036_854_775_807; // SQLite rowid upper bound
const PAGE_LIMIT = 20;

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
