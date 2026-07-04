import * as db from "../database/db";
import { visibilityFilter } from "../utils/visibility";

/**
 * Data-access layer for the `post` table (community feed). Part of the P1
 * repository migration (migration/REMEDIATION.md) — all post SQL lives here so
 * the controller keeps only request parsing, validation, geocoding and
 * response shaping.
 */

// Shared projection: post columns plus the computed upvote count.
const POST_SELECT = `
    p.id, p.creatorID, p.title, p.location, p.latitude, p.longitude,
    p.category, p.tags, p.message, p.image, p.createdAt,
    (SELECT COUNT(*) FROM post_upvote WHERE postID = p.id) AS upvotes
`;

export interface NewPost {
    creatorID: number;
    title: string;
    location: string;
    latitude: number | null;
    longitude: number | null;
    category: string;
    tags: string;
    message: string;
    image: string | null;
}

/** All posts visible to `userID`, newest first. */
export function findAllVisible(userID: number | null): any[] {
    const vis = visibilityFilter(userID, "a", "p.creatorID");
    return db.query(`
        SELECT ${POST_SELECT}
        FROM post p
        LEFT JOIN account a ON a.id = p.creatorID
        WHERE ${vis.sql}
        ORDER BY createdAt DESC
    `, vis.params);
}

/** A single post if it exists AND is visible to `userID`, else undefined. */
export function findByIdVisible(postID: string | number, userID: number | null): any | undefined {
    const vis = visibilityFilter(userID, "a", "p.creatorID");
    return db.query(`
        SELECT ${POST_SELECT}
        FROM post p
        LEFT JOIN account a ON a.id = p.creatorID
        WHERE p.id = ? AND ${vis.sql}
    `, [postID, ...vis.params])[0];
}

/** Full post row by id with no visibility filter (used after a mutation). */
export function findById(postID: string | number): any | undefined {
    return db.query(`SELECT ${POST_SELECT} FROM post p WHERE p.id = ?`, [postID])[0];
}

/** Owner row (`{ creatorID }`) or undefined when the post does not exist. */
export function findOwner(postID: string | number): { creatorID: number } | undefined {
    return db.query("SELECT creatorID FROM post WHERE id = ?", [postID])[0];
}

/** `{ id, creatorID }` for the upvote flow, or undefined when missing. */
export function findIdAndOwner(postID: string | number): { id: number; creatorID: number } | undefined {
    return db.query("SELECT id, creatorID FROM post WHERE id = ?", [postID])[0];
}

/** Insert a post; returns the created row (without upvotes). */
export function insert(post: NewPost): any {
    return db.query(`
        INSERT INTO post (creatorID, title, location, latitude, longitude, category, tags, message, image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id, creatorID, title, location, latitude, longitude, category, tags, message, image, createdAt;
    `, [
        post.creatorID, post.title, post.location, post.latitude, post.longitude,
        post.category, post.tags, post.message, post.image,
    ])[0];
}

/** Apply a partial update. Column names come only from trusted call sites. */
export function update(postID: string | number, fields: Record<string, unknown>): void {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    db.query(`UPDATE post SET ${setClause} WHERE id = ?`, [...keys.map((k) => fields[k]), postID]);
}

/** Delete a post; returns the run result (has `.changes`). */
export function deleteById(postID: string | number): { changes: number } {
    return db.query("DELETE FROM post WHERE id = ?", [postID]);
}

/** Record an upvote. Throws on the UNIQUE constraint if already upvoted. */
export function insertUpvote(postID: string | number, userID: number): void {
    db.query("INSERT INTO post_upvote (postID, accountID) VALUES (?, ?)", [postID, userID]);
}

/** Posts with coordinates inside a bounding box, newest first (max 20). */
export function findNearby(
    userID: number | null,
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number,
): any[] {
    const vis = visibilityFilter(userID, "a", "p.creatorID");
    return db.query(`
        SELECT ${POST_SELECT}
        FROM post p
        LEFT JOIN account a ON a.id = p.creatorID
        WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
        AND p.latitude BETWEEN ? AND ?
        AND p.longitude BETWEEN ? AND ?
        AND ${vis.sql}
        ORDER BY p.createdAt DESC
        LIMIT 20
    `, [minLat, maxLat, minLng, maxLng, ...vis.params]);
}
