import { Request, Response } from "express";
import * as db from "../database/db";

function withUpvotes(post: any): any {
    const [{ count }] = db.query(
        "SELECT COUNT(*) as count FROM post_upvote WHERE postID = ?",
        [post.id]
    );
    return {
        ...post,
        upvotes: count,
        tags: post.tags ? post.tags.split(',').map((t: string) => t.trim()) : [],
    };
}

export function getAllPosts(req: Request, res: Response) {
    const results = db.query(`
        SELECT p.id, p.creatorID, p.title, p.location, p.category, p.tags,
               p.message, p.image, p.createdAt,
               (SELECT COUNT(*) FROM post_upvote WHERE postID = p.id) AS upvotes
        FROM post p
        ORDER BY createdAt DESC
    `);

    const posts = results.map((post: any) => ({
        ...post,
        tags: post.tags ? post.tags.split(',').map((t: string) => t.trim()) : [],
    }));

    res.json(posts);
}

export function getPost(req: Request, res: Response) {
    const postID = req.params.id;
    const results = db.query(`
        SELECT p.id, p.creatorID, p.title, p.location, p.category, p.tags,
               p.message, p.image, p.createdAt,
               (SELECT COUNT(*) FROM post_upvote WHERE postID = p.id) AS upvotes
        FROM post p WHERE p.id = ?
    `, [postID]);

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

    const tagsString = Array.isArray(tags) ? tags.join(',') : (tags || '');

    try {
        const results = db.query(
            `
            INSERT INTO post (creatorID, title, location, category, tags, message, image)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING id, creatorID, title, location, category, tags, message, image, createdAt;
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
        if (!newPost) {
            throw new Error("Failed to retrieve created post");
        }

        res.status(201).json({
            ...newPost,
            upvotes: 0,
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

    if (updates.length > 0) {
        params.push(postID);
        const sql = `UPDATE post SET ${updates.join(", ")} WHERE id = ?`;
        db.query(sql, params);
    }

    const updatedPost = db.query(`
        SELECT p.id, p.creatorID, p.title, p.location, p.category, p.tags,
               p.message, p.image, p.createdAt,
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

    db.query("DELETE FROM post WHERE id = ?", [postID]);
    res.status(200).json({ message: "Post deleted successfully" });
}

export function upvotePost(req: Request, res: Response) {
    const postID = req.params.id;
    const userID = req.user?.id;

    const post = db.query("SELECT id FROM post WHERE id = ?", [postID])[0];
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
        console.error("Upvote error:", error);
        return res.status(500).send();
    }

    const updatedPost = db.query(`
        SELECT p.id, p.creatorID, p.title, p.location, p.category, p.tags,
               p.message, p.image, p.createdAt,
               (SELECT COUNT(*) FROM post_upvote WHERE postID = p.id) AS upvotes
        FROM post p WHERE p.id = ?
    `, [postID])[0];

    res.json({
        ...updatedPost,
        tags: updatedPost.tags ? updatedPost.tags.split(',').map((t: string) => t.trim()) : [],
    });
}
