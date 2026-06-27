import { Request, Response } from "express";
import * as db from "../database/db";
import { geocodeLocation } from "../utils/geocoding";
import { logError } from "../utils/logger";
import { visibilityFilter } from "../utils/visibility";
import { stripHtml } from "../utils/sanitize";
import { createNotification } from "../services/notifications";

const MAX_TITLE_LENGTH = 300;
const MAX_LOCATION_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 10000;
const MAX_CATEGORY_LENGTH = 50;

function isValidUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return ['http:', 'https:'].includes(urlObj.protocol);
    } catch {
        return false;
    }
}

export function getAllPosts(req: Request, res: Response) {
    const userID = req.user?.id ?? null;
    const vis = visibilityFilter(userID, "a", "p.creatorID");
    const results = db.query(`
        SELECT p.id, p.creatorID, p.title, p.location, p.latitude, p.longitude,
               p.category, p.tags, p.message, p.image, p.createdAt,
               (SELECT COUNT(*) FROM post_upvote WHERE postID = p.id) AS upvotes
        FROM post p
        LEFT JOIN account a ON a.id = p.creatorID
        WHERE ${vis.sql}
        ORDER BY createdAt DESC
    `, vis.params);

    const posts = results.map((post: any) => ({
        ...post,
        tags: post.tags ? post.tags.split(',').map((t: string) => t.trim()) : [],
    }));

    res.json(posts);
}

export function getPost(req: Request, res: Response) {
    const postID = req.params.id;
    const userID = req.user?.id ?? null;
    const vis = visibilityFilter(userID, "a", "p.creatorID");
    const results = db.query(`
        SELECT p.id, p.creatorID, p.title, p.location, p.latitude, p.longitude,
               p.category, p.tags, p.message, p.image, p.createdAt,
               (SELECT COUNT(*) FROM post_upvote WHERE postID = p.id) AS upvotes
        FROM post p
        LEFT JOIN account a ON a.id = p.creatorID
        WHERE p.id = ? AND ${vis.sql}
    `, [postID, ...vis.params]);

    // 404 (not 403) when hidden by visibility — don't leak that the post exists.
    if (results.length === 0) {
        return res.status(404).json({ message: "Post not found" });
    }

    const post = results[0];
    res.json({
        ...post,
        tags: post.tags ? post.tags.split(',').map((t: string) => t.trim()) : [],
    });
}

export async function createPost(req: Request, res: Response) {
    const { title, location, category, tags, message, image } = req.body;

    if (!title || String(title).trim().length === 0) {
        return res.status(400).json({ message: "Title is required" });
    }

    if (!message || String(message).trim().length === 0) {
        return res.status(400).json({ message: "Message is required" });
    }

    const titleStr = stripHtml(String(title).trim());
    if (titleStr.length > MAX_TITLE_LENGTH) {
        return res.status(400).json({ message: `Title must be ${MAX_TITLE_LENGTH} characters or less` });
    }

    const locationStr = location ? String(location).trim() : '';
    if (locationStr.length > MAX_LOCATION_LENGTH) {
        return res.status(400).json({ message: `Location must be ${MAX_LOCATION_LENGTH} characters or less` });
    }

    const messageStr = stripHtml(String(message).trim());
    if (messageStr.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ message: `Message must be ${MAX_MESSAGE_LENGTH} characters or less` });
    }

    const categoryStr = category ? String(category).trim() : 'New';
    if (categoryStr.length > MAX_CATEGORY_LENGTH) {
        return res.status(400).json({ message: `Category must be ${MAX_CATEGORY_LENGTH} characters or less` });
    }

    let imageStr = null;
    if (image) {
        imageStr = String(image).trim();
        if (!isValidUrl(imageStr)) {
            return res.status(400).json({ message: "Invalid image URL" });
        }
    }

    const tagsString = Array.isArray(tags) ? tags.join(',') : (tags || '');

    try {
        // Geocode location if provided
        let latitude: number | null = null;
        let longitude: number | null = null;
        
        if (locationStr) {
            const coords = await geocodeLocation(locationStr);
            if (coords) {
                latitude = coords.latitude;
                longitude = coords.longitude;
            }
        }

        const results = db.query(
            `
            INSERT INTO post (creatorID, title, location, latitude, longitude, category, tags, message, image)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id, creatorID, title, location, latitude, longitude, category, tags, message, image, createdAt;
            `,
            [
                req.user.id,
                titleStr,
                locationStr,
                latitude,
                longitude,
                categoryStr,
                tagsString,
                messageStr,
                imageStr,
            ]
        );

        const newPost = results[0];
        if (!newPost) {
            throw new Error("Failed to retrieve created post");
        }

        res.status(201).json({
            ...newPost,
            upvotes: 0,
            tags: newPost.tags ? newPost.tags.split(',').map((t: string) => t.trim()) : [],
        });
    } catch (err) {
        logError(req, "Error creating post", err);
        res.status(500).json({ message: "Failed to create post" });
    }
}

export async function updatePost(req: Request, res: Response) {
    const postID = req.params.id;
    const userID = req.user?.id;
    const { title, location, category, tags, message, image } = req.body;

    const post = db.query("SELECT creatorID FROM post WHERE id = ?", [postID])[0];
    if (!post) {
        return res.status(404).json({ message: "Post not found" });
    }

    // Null creatorID means no owner — no one can edit it
    if (post.creatorID === null || Number(post.creatorID) !== Number(userID)) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (title !== undefined) {
        const titleStr = stripHtml(String(title).trim());
        if (titleStr.length > MAX_TITLE_LENGTH) {
            return res.status(400).json({ message: `Title must be ${MAX_TITLE_LENGTH} characters or less` });
        }
        updates.push("title = ?");
        params.push(titleStr);
    }
    if (location !== undefined) {
        const locationStr = String(location).trim();
        if (locationStr.length > MAX_LOCATION_LENGTH) {
            return res.status(400).json({ message: `Location must be ${MAX_LOCATION_LENGTH} characters or less` });
        }
        updates.push("location = ?");
        params.push(locationStr);
    }
    if (category !== undefined) {
        const categoryStr = String(category).trim();
        if (categoryStr.length > MAX_CATEGORY_LENGTH) {
            return res.status(400).json({ message: `Category must be ${MAX_CATEGORY_LENGTH} characters or less` });
        }
        updates.push("category = ?");
        params.push(categoryStr);
    }
    if (tags !== undefined) {
        updates.push("tags = ?");
        params.push(Array.isArray(tags) ? tags.join(',') : tags);
    }
    if (message !== undefined) {
        const messageStr = stripHtml(String(message).trim());
        if (messageStr.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ message: `Message must be ${MAX_MESSAGE_LENGTH} characters or less` });
        }
        updates.push("message = ?");
        params.push(messageStr);
    }
    if (image !== undefined) {
        if (image && !isValidUrl(String(image).trim())) {
            return res.status(400).json({ message: "Invalid image URL" });
        }
        updates.push("image = ?");
        params.push(image ? String(image).trim() : null);
    }

    // If location is updated, geocode it. Only overwrite coordinates when geocoding
    // succeeds — otherwise a transient failure would blank out valid coordinates and
    // break map features. The previous coordinates are left intact.
    if (location !== undefined) {
        const coords = await geocodeLocation(String(location).trim());
        if (coords) {
            updates.push("latitude = ?");
            params.push(coords.latitude);
            updates.push("longitude = ?");
            params.push(coords.longitude);
        }
    }

    if (updates.length > 0) {
        params.push(postID);
        const sql = `UPDATE post SET ${updates.join(", ")} WHERE id = ?`;
        db.query(sql, params);
    }

    const updatedPost = db.query(`
        SELECT p.id, p.creatorID, p.title, p.location, p.latitude, p.longitude,
               p.category, p.tags, p.message, p.image, p.createdAt,
               (SELECT COUNT(*) FROM post_upvote WHERE postID = p.id) AS upvotes
        FROM post p WHERE p.id = ?
    `, [postID])[0];

    res.json({
        ...updatedPost,
        tags: updatedPost.tags ? updatedPost.tags.split(',').map((t: string) => t.trim()) : [],
    });
}

export function deletePost(req: Request, res: Response) {
    const postID = req.params.id;
    const userID = req.user?.id;

    const post = db.query("SELECT creatorID FROM post WHERE id = ?", [postID])[0];
    if (!post) {
        return res.status(404).json({ message: "Post not found" });
    }

    // Null creatorID means no owner — no one can delete it
    if (post.creatorID === null || Number(post.creatorID) !== Number(userID)) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    const result = db.query("DELETE FROM post WHERE id = ?", [postID]);
    if (result.changes === 0) {
        return res.status(404).json({ message: "Post not found" });
    }
    res.status(200).json({ message: "Post deleted successfully" });
}

export function upvotePost(req: Request, res: Response) {
    const postID = req.params.id;
    const userID = req.user?.id;

    const post = db.query("SELECT id, creatorID FROM post WHERE id = ?", [postID])[0];
    if (!post) {
        return res.status(404).json({ message: "Post not found" });
    }

    try {
        db.query(
            "INSERT INTO post_upvote (postID, accountID) VALUES (?, ?)",
            [postID, userID]
        );
    } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT' || error.message?.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ message: "Already upvoted" });
        }
        logError(req, "Upvote error", error);
        return res.status(500).send();
    }

    // Notify the post's creator that someone upvoted (best-effort).
    if (post.creatorID != null) {
        createNotification({
            recipientID: Number(post.creatorID),
            actorID: Number(userID),
            type: "post_upvote",
            entityType: "post",
            entityID: Number(postID),
        });
    }

    const updatedPost = db.query(`
        SELECT p.id, p.creatorID, p.title, p.location, p.latitude, p.longitude,
               p.category, p.tags, p.message, p.image, p.createdAt,
               (SELECT COUNT(*) FROM post_upvote WHERE postID = p.id) AS upvotes
        FROM post p WHERE p.id = ?
    `, [postID])[0];

    res.json({
        ...updatedPost,
        tags: updatedPost.tags ? updatedPost.tags.split(',').map((t: string) => t.trim()) : [],
    });
}

// Get nearby posts within a bounding box
export function getNearbyPosts(req: Request, res: Response) {
    const { bbox } = req.query;

    if (!bbox || typeof bbox !== 'string') {
        return res.status(400).json({ message: "bbox query parameter is required (format: minLng,minLat,maxLng,maxLat)" });
    }

    const parts = bbox.split(',');
    if (parts.length !== 4) {
        return res.status(400).json({ message: "bbox must have 4 values: minLng,minLat,maxLng,maxLat" });
    }

    const minLng = parseFloat(parts[0]);
    const minLat = parseFloat(parts[1]);
    const maxLng = parseFloat(parts[2]);
    const maxLat = parseFloat(parts[3]);

    if (isNaN(minLng) || isNaN(minLat) || isNaN(maxLng) || isNaN(maxLat)) {
        return res.status(400).json({ message: "All bbox values must be valid numbers" });
    }

    try {
        const userID = req.user?.id ?? null;
        const vis = visibilityFilter(userID, "a", "p.creatorID");
        const results = db.query(`
            SELECT p.id, p.creatorID, p.title, p.location, p.latitude, p.longitude,
                   p.category, p.tags, p.message, p.image, p.createdAt,
                   (SELECT COUNT(*) FROM post_upvote WHERE postID = p.id) AS upvotes
            FROM post p
            LEFT JOIN account a ON a.id = p.creatorID
            WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
            AND p.latitude BETWEEN ? AND ?
            AND p.longitude BETWEEN ? AND ?
            AND ${vis.sql}
            ORDER BY p.createdAt DESC
            LIMIT 20
        `, [minLat, maxLat, minLng, maxLng, ...vis.params]);

        const posts = results.map((post: any) => ({
            ...post,
            tags: post.tags ? post.tags.split(',').map((t: string) => t.trim()) : [],
        }));

        res.json(posts);
    } catch (error) {
        logError(req, "Error fetching nearby posts", error);
        res.status(500).json({ message: "Failed to fetch nearby posts" });
    }
}
