import { Request, Response } from "express";
import * as db from "../database/db";

export function getAllPosts(req: Request, res: Response) {
    const results = db.query(`
        SELECT id, creatorID, title, location, category, tags, message, image, upvotes, createdAt 
        FROM post 
        ORDER BY createdAt DESC
    `);
    
    // Parse tags from comma-separated string to array
    const posts = results.map((post: any) => ({
        ...post,
        tags: post.tags ? post.tags.split(',').map((t: string) => t.trim()) : [],
    }));
    
    res.json(posts);
}

export function getPost(req: Request, res: Response) {
    const postID = req.params.id;
    const results = db.query(`SELECT * FROM post WHERE id = ?`, [postID]);
    
    if (results.length === 0) {
        return res.status(404).json({ message: "Post not found" });
    }
    
    const post = results[0];
    res.json({
        ...post,
        tags: post.tags ? post.tags.split(',').map((t: string) => t.trim()) : [],
    });
}

export function createPost(req: Request, res: Response) {
    const { title, location, category, tags, message, image } = req.body;
    
    // Convert tags array to comma-separated string for storage
    const tagsString = Array.isArray(tags) ? tags.join(',') : tags || '';
    
    try {
        const results = db.query(
            `
            INSERT INTO post (creatorID, title, location, category, tags, message, image)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING id, creatorID, title, location, category, tags, message, image, upvotes, createdAt;
            `,
            [
                req.user?.id || null,
                title,
                location,
                category || 'New',
                tagsString,
                message,
                image || null,
            ]
        );
        
        const newPost = results[0];
        res.status(201).json({
            ...newPost,
            tags: newPost.tags ? newPost.tags.split(',').map((t: string) => t.trim()) : [],
        });
    } catch (err) {
        console.error("Error creating post:", err);
        res.status(500).json({ message: "Failed to create post" });
    }
}

export function updatePost(req: Request, res: Response) {
    const postID = req.params.id;
    const userID = req.user?.id;
    const { title, location, category, tags, message, image, upvotes } = req.body;

    const post = db.query("SELECT creatorID FROM post WHERE id = ?", [postID])[0];
    if (!post) {
        return res.status(404).json({ message: "Post not found" });
    }
    
    // Only allow updates by creator (if post has a creator)
    if (post.creatorID && post.creatorID !== userID) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (title !== undefined) {
        updates.push("title = ?");
        params.push(title);
    }
    if (location !== undefined) {
        updates.push("location = ?");
        params.push(location);
    }
    if (category !== undefined) {
        updates.push("category = ?");
        params.push(category);
    }
    if (tags !== undefined) {
        updates.push("tags = ?");
        params.push(Array.isArray(tags) ? tags.join(',') : tags);
    }
    if (message !== undefined) {
        updates.push("message = ?");
        params.push(message);
    }
    if (image !== undefined) {
        updates.push("image = ?");
        params.push(image);
    }
    if (upvotes !== undefined) {
        updates.push("upvotes = ?");
        params.push(upvotes);
    }

    if (updates.length > 0) {
        params.push(postID);
        const sql = `UPDATE post SET ${updates.join(", ")} WHERE id = ?`;
        db.query(sql, params);
    }

    const updatedPost = db.query("SELECT * FROM post WHERE id = ?", [postID])[0];
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

    // Only allow deletion by creator (if post has a creator)
    if (post.creatorID && post.creatorID !== userID) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    db.query("DELETE FROM post WHERE id = ?", [postID]);
    res.status(200).json({ message: "Post deleted successfully" });
}

export function upvotePost(req: Request, res: Response) {
    const postID = req.params.id;
    
    const post = db.query("SELECT id, upvotes FROM post WHERE id = ?", [postID])[0];
    if (!post) {
        return res.status(404).json({ message: "Post not found" });
    }
    
    db.query("UPDATE post SET upvotes = upvotes + 1 WHERE id = ?", [postID]);
    
    const updatedPost = db.query("SELECT * FROM post WHERE id = ?", [postID])[0];
    res.json({
        ...updatedPost,
        tags: updatedPost.tags ? updatedPost.tags.split(',').map((t: string) => t.trim()) : [],
    });
}
