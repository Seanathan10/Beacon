import { Request, Response } from "express";
import * as postRepo from "../repositories/postRepo";
import { geocodeLocation } from "../utils/geocoding";
import { logError } from "../utils/logger";
import { stripHtml } from "../utils/sanitize";
import { isOwner } from "../utils/ownership";
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

// Posts store tags as a comma-separated string; the API returns them as an array.
function mapPost(post: any) {
    return {
        ...post,
        tags: post.tags ? post.tags.split(',').map((t: string) => t.trim()) : [],
    };
}

export function getAllPosts(req: Request, res: Response) {
    const userID = req.user?.id ?? null;
    res.json(postRepo.findAllVisible(userID).map(mapPost));
}

export function getPost(req: Request, res: Response) {
    const postID = String(req.params.id);
    const userID = req.user?.id ?? null;

    const post = postRepo.findByIdVisible(postID, userID);
    // 404 (not 403) when hidden by visibility — don't leak that the post exists.
    if (!post) {
        return res.status(404).json({ message: "Post not found" });
    }

    res.json(mapPost(post));
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

        const newPost = postRepo.insert({
            creatorID: req.user.id,
            title: titleStr,
            location: locationStr,
            latitude,
            longitude,
            category: categoryStr,
            tags: tagsString,
            message: messageStr,
            image: imageStr,
        });

        if (!newPost) {
            throw new Error("Failed to retrieve created post");
        }

        res.status(201).json({ ...mapPost(newPost), upvotes: 0 });
    } catch (err) {
        logError(req, "Error creating post", err);
        res.status(500).json({ message: "Failed to create post" });
    }
}

export async function updatePost(req: Request, res: Response) {
    const postID = String(req.params.id);
    const userID = req.user?.id;
    const { title, location, category, tags, message, image } = req.body;

    const post = postRepo.findOwner(postID);
    if (!post) {
        return res.status(404).json({ message: "Post not found" });
    }

    // Null creatorID means no owner — no one can edit it
    if (!isOwner(post.creatorID, userID)) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    const fields: Record<string, unknown> = {};

    if (title !== undefined) {
        const titleStr = stripHtml(String(title).trim());
        if (titleStr.length > MAX_TITLE_LENGTH) {
            return res.status(400).json({ message: `Title must be ${MAX_TITLE_LENGTH} characters or less` });
        }
        fields.title = titleStr;
    }
    if (location !== undefined) {
        const locationStr = String(location).trim();
        if (locationStr.length > MAX_LOCATION_LENGTH) {
            return res.status(400).json({ message: `Location must be ${MAX_LOCATION_LENGTH} characters or less` });
        }
        fields.location = locationStr;
    }
    if (category !== undefined) {
        const categoryStr = String(category).trim();
        if (categoryStr.length > MAX_CATEGORY_LENGTH) {
            return res.status(400).json({ message: `Category must be ${MAX_CATEGORY_LENGTH} characters or less` });
        }
        fields.category = categoryStr;
    }
    if (tags !== undefined) {
        fields.tags = Array.isArray(tags) ? tags.join(',') : tags;
    }
    if (message !== undefined) {
        const messageStr = stripHtml(String(message).trim());
        if (messageStr.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ message: `Message must be ${MAX_MESSAGE_LENGTH} characters or less` });
        }
        fields.message = messageStr;
    }
    if (image !== undefined) {
        if (image && !isValidUrl(String(image).trim())) {
            return res.status(400).json({ message: "Invalid image URL" });
        }
        fields.image = image ? String(image).trim() : null;
    }

    // If location is updated, geocode it. Only overwrite coordinates when geocoding
    // succeeds — otherwise a transient failure would blank out valid coordinates and
    // break map features. The previous coordinates are left intact.
    if (location !== undefined) {
        const coords = await geocodeLocation(String(location).trim());
        if (coords) {
            fields.latitude = coords.latitude;
            fields.longitude = coords.longitude;
        }
    }

    postRepo.update(postID, fields);

    res.json(mapPost(postRepo.findById(postID)));
}

export function deletePost(req: Request, res: Response) {
    const postID = String(req.params.id);
    const userID = req.user?.id;

    const post = postRepo.findOwner(postID);
    if (!post) {
        return res.status(404).json({ message: "Post not found" });
    }

    // Null creatorID means no owner — no one can delete it
    if (!isOwner(post.creatorID, userID)) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    const result = postRepo.deleteById(postID);
    if (result.changes === 0) {
        return res.status(404).json({ message: "Post not found" });
    }
    res.status(200).json({ message: "Post deleted successfully" });
}

export function upvotePost(req: Request, res: Response) {
    const postID = String(req.params.id);
    const userID = req.user?.id;

    const post = postRepo.findIdAndOwner(postID);
    if (!post) {
        return res.status(404).json({ message: "Post not found" });
    }

    try {
        postRepo.insertUpvote(postID, userID);
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

    res.json(mapPost(postRepo.findById(postID)));
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
        const results = postRepo.findNearby(userID, minLat, maxLat, minLng, maxLng);
        res.json(results.map(mapPost));
    } catch (error) {
        logError(req, "Error fetching nearby posts", error);
        res.status(500).json({ message: "Failed to fetch nearby posts" });
    }
}
