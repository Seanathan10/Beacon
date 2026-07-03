import * as db from "../database/db";
import { visibilityFilter } from "../utils/visibility";

/**
 * Data-access layer for the `pin` table.
 *
 * This is the first repository in the P1 migration (see migration/REMEDIATION.md):
 * raw SQL is moving out of the route handlers so controllers stop talking to the
 * database directly. Behaviour is preserved exactly — these methods are a
 * mechanical extraction of the queries that previously lived in routes/pins.ts.
 */

// Columns returned by the single-pin / user-pin reads. Kept as one constant so
// the shape stays consistent across callers.
const PIN_COLUMNS =
    "id, creatorID, latitude, longitude, title, address, description, image, likes, tags";

export interface NewPin {
    creatorID: number;
    latitude: number;
    longitude: number;
    title: string | null;
    address: string | null;
    description: string | null;
    image: string | null;
    tags: string;
}

/** Full row(s) for a single pin by id. Returns an array (0 or 1 rows). */
export function findById(id: string | number): any[] {
    return db.query(`SELECT ${PIN_COLUMNS} FROM pin WHERE id = ?`, [id]);
}

/** All pins created by a given account. */
export function findByCreator(creatorID: number): any[] {
    return db.query(`SELECT ${PIN_COLUMNS} FROM pin WHERE creatorID = ?`, [creatorID]);
}

/** A page of a creator's pins (newest first) with computed like counts. */
export function findByCreatorPaged(creatorID: number, limit: number, offset: number): any[] {
    return db.query(`
        SELECT p.id, p.creatorID, p.latitude, p.longitude, p.title, p.address,
               p.description, p.image, p.tags, p.createdAt,
               (SELECT COUNT(*) FROM likes WHERE pinID = p.id) AS likes
        FROM pin p WHERE p.creatorID = ?
        ORDER BY p.createdAt DESC
        LIMIT ? OFFSET ?
    `, [creatorID, limit, offset]);
}

/**
 * The owner row for a pin (`{ creatorID }`) or `undefined` when the pin does
 * not exist. Callers decide the 404/403 semantics themselves.
 */
export function findOwner(id: string | number): { creatorID: number } | undefined {
    return db.query("SELECT creatorID FROM pin WHERE id = ?", [id])[0];
}

/** Insert a pin and return `{ id }` of the new row. */
export function insert(pin: NewPin): { id: number } {
    return db.query(
        `INSERT INTO pin(creatorID, latitude, longitude, title, address, description, image, tags, likes)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0)
         RETURNING id;`,
        [
            pin.creatorID,
            pin.latitude,
            pin.longitude,
            pin.title,
            pin.address,
            pin.description,
            pin.image,
            pin.tags,
        ],
    )[0];
}

/**
 * Apply a partial update to a pin. `fields` maps column name → value; an empty
 * object is a no-op. Column names come only from trusted call sites.
 */
export function update(id: string | number, fields: Record<string, unknown>): void {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    db.query(`UPDATE pin SET ${setClause} WHERE id = ?`, [...keys.map((k) => fields[k]), id]);
}

/** Delete a pin by id. Returns the raw run result (has `.changes`). */
export function deleteById(id: string | number): { changes: number } {
    return db.query("DELETE FROM pin WHERE id = ?", [id]);
}

/** True when a pin with this id exists. */
export function existsById(id: string | number): boolean {
    return db.query("SELECT id FROM pin WHERE id = ?", [id]).length > 0;
}

// ── Map / list reads ────────────────────────────────────────────────────────
// These join `account` for the creator email and compute a per-viewer
// `userStatus`, and apply the creator's profile-visibility filter. Columns are
// listed inline (rather than via PIN_COLUMNS) because they alias joined fields.

export interface PinSearchFilters {
    userID: number | null;
    tags: string[];
    /** validated YYYY-MM-DD, or "" for no bound */
    minDate: string;
    maxDate: string;
    minRating: number | null;
    maxRating: number | null;
    /** "", "bookmarked", "visited" or "wishlist" */
    bookmarkStatus: string;
    creatorID: number | null;
}

/**
 * Filterable pin search used by GET /api/pins. Builds the WHERE clause from a
 * structured filter object; the controller owns request parsing and any
 * distance sorting done in JS afterwards.
 */
export function search(f: PinSearchFilters): any[] {
    // params[0] is always userID for the userStatus subquery in the SELECT.
    const conditions: string[] = [];
    const params: any[] = [f.userID];

    if (f.tags.length > 0) {
        conditions.push(`(${f.tags.map(() => "p.tags LIKE ?").join(" OR ")})`);
        f.tags.forEach((t) => params.push(`%${t}%`));
    }

    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (f.minDate && DATE_RE.test(f.minDate)) {
        conditions.push("p.createdAt >= ?");
        params.push(f.minDate);
    }
    if (f.maxDate && DATE_RE.test(f.maxDate)) {
        conditions.push("p.createdAt <= ?");
        params.push(f.maxDate + " 23:59:59");
    }

    if (f.creatorID !== null) {
        conditions.push("p.creatorID = ?");
        params.push(f.creatorID);
    }

    if (f.bookmarkStatus === "bookmarked") {
        conditions.push("EXISTS (SELECT 1 FROM bookmark WHERE pinID = p.id AND accountID = ?)");
        params.push(f.userID);
    } else if (f.bookmarkStatus === "visited" || f.bookmarkStatus === "wishlist") {
        conditions.push("EXISTS (SELECT 1 FROM pin_status WHERE pinID = p.id AND accountID = ? AND status = ?)");
        params.push(f.userID, f.bookmarkStatus);
    }

    const vis = visibilityFilter(f.userID, "a", "p.creatorID");
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

    // Outer query to filter by the computed likes count (minRating / maxRating).
    const validMin = f.minRating !== null && !isNaN(f.minRating);
    const validMax = f.maxRating !== null && !isNaN(f.maxRating);
    if (validMin || validMax) {
        const ratingConds: string[] = [];
        if (validMin) { ratingConds.push("likes >= ?"); params.push(f.minRating); }
        if (validMax) { ratingConds.push("likes <= ?"); params.push(f.maxRating); }
        sql = `SELECT * FROM (${sql}) WHERE ${ratingConds.join(" AND ")}`;
    }

    return db.query(sql, params);
}

/** Trending pins: likes plus a recency boost within the given window. */
export function findTrending(userID: number | null, days: number): any[] {
    const vis = visibilityFilter(userID, "a", "p.creatorID");
    return db.query(`
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
}

/** Pins that co-likers of `pinID` also liked, ranked by shared likers. */
export function findSimilar(pinID: string | number, userID: number | null): any[] {
    const vis = visibilityFilter(userID, "a", "p.creatorID");
    return db.query(`
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
}

/**
 * Pins in a bounding box for trip planning, flagged with whether each belongs to
 * `userId` (own pins sort first). Pass a non-matching id when unauthenticated.
 */
export function findNearbyForTrip(
    userId: number | null,
    latMin: number,
    latMax: number,
    lngMin: number,
    lngMax: number,
): any[] {
    return db.query(`
        SELECT
            id, title, description, latitude, longitude, tags, image, creatorID,
            CASE WHEN creatorID = ? THEN 1 ELSE 0 END as isUserPin
        FROM pin
        WHERE latitude BETWEEN ? AND ?
          AND longitude BETWEEN ? AND ?
        ORDER BY isUserPin DESC, id ASC
        LIMIT 30
    `, [userId ?? -1, latMin, latMax, lngMin, lngMax]);
}

/** Pins within a lat/lng bounding box (a pre-filter; caller refines by distance). */
export function findInBoundingBox(
    userID: number | null,
    latMin: number,
    latMax: number,
    lngMin: number,
    lngMax: number,
): any[] {
    const vis = visibilityFilter(userID, "a", "p.creatorID");
    return db.query(`
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
    `, [userID, latMin, latMax, lngMin, lngMax, ...vis.params]);
}
