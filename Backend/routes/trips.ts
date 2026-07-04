import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import * as itineraryRepo from "../repositories/itineraryRepo";
import { logError } from "../utils/logger";
import { sanitizeDeep, stripHtml } from "../utils/sanitize";
import { deriveTripCarbon } from "../utils/tripCarbon";
import { calculateOffsetCost } from "../utils/carbon";
import { isOwner } from "../utils/ownership";
import { parseCursor } from "../utils/pagination";
import { recordChallengeEvent } from "../services/challenges";

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

    const cursor = parseCursor(req.query.cursor, MAX_CURSOR);
    if (cursor === "invalid") {
        return res.status(400).json({ message: "Invalid cursor" });
    }

    try {
        const rows = itineraryRepo.findByCreatorPaged(userID, cursor, PAGE_LIMIT + 1);

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
        const row = itineraryRepo.findById(id);

        if (!row || !isOwner(row.creatorID, userID)) {
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

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * GET /api/me/carbon-stats — aggregate the viewer's saved/published trips into a
 * personal sustainability summary. Only trips that carry carbon data count.
 */
export function getCarbonStats(req: Request, res: Response) {
    const userID = req.user.id;

    try {
        const totals = itineraryRepo.getCarbonTotals(userID);

        const byMonth = itineraryRepo.getCarbonByMonth(userID)
            .map((r) => ({
                month: r.month,
                count: r.count,
                carbonKg: round2(r.carbonKg),
                savedKg: round2(r.savedKg),
            }));

        const totalCarbonKg = round2(totals.totalCarbonKg);
        const totalSavedKg = round2(totals.totalSavedKg);
        const typicalTotal = totalCarbonKg + totalSavedKg;
        const avgSavingsPct = typicalTotal > 0 ? Math.round((totalSavedKg / typicalTotal) * 100) : 0;

        res.json({
            tripCount: totals.tripCount,
            totalCarbonKg,
            totalSavedKg,
            avgSavingsPct,
            offsetCostUsd: calculateOffsetCost(totalCarbonKg),
            byMonth,
        });
    } catch (err) {
        logError(req, "Carbon stats error", err);
        res.status(500).json({ message: "Failed to compute carbon stats" });
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
            const existing = itineraryRepo.findOwnerAndPublic(tripId);

            if (!existing || !isOwner(existing.creatorID, userID)) {
                return res.status(404).json({ message: "Trip not found" });
            }
            if (existing.isPublic === 1) {
                return res.status(409).json({ message: "Published trips are immutable" });
            }

            itineraryRepo.updateDraft(tripId, Number(userID), cleanTitle, data, carbonKg, savedKg);

            return res.status(200).json({ id: tripId, isPublic: false });
        }

        const newId = uuidv4();
        itineraryRepo.insertDraft(newId, Number(userID), cleanTitle, data, carbonKg, savedKg);

        // Advance eco-challenges only when a new trip is created (not on updates).
        recordChallengeEvent(Number(userID), "trips_saved", 1);
        if (savedKg && savedKg > 0) {
            recordChallengeEvent(Number(userID), "carbon_saved", savedKg);
        }

        res.status(201).json({ id: newId, isPublic: false });
    } catch (err) {
        logError(req, "Save trip error", err);
        res.status(500).json({ message: "Failed to save trip" });
    }
}
