import * as db from "../database/db";

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
