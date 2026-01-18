import { Request, Response } from "express";
import * as db from "../database/db";

// Get all comments for a specific pin
export function getPinComments(req: Request, res: Response) {
    const pinID = req.params.pinId;
    
    const results = db.query(
        `
        SELECT 
            c.id,
            c.pinID,
            c.accountID,
            c.comment,
            c.createdAt,
            a.email
        FROM comment c
        JOIN account a ON a.id = c.accountID
        WHERE c.pinID = ?
        ORDER BY c.createdAt DESC;
        `,
        [pinID]
    );
    
    res.json(results);
}

// Create a new comment on a pin
export function createComment(req: Request, res: Response) {
    const pinID = req.params.pinId;
    const { comment } = req.body;
    const userID = req.user.id;

    if (!comment || comment.trim().length === 0) {
        res.status(400).json({ message: "Comment text is required" });
        return;
    }

    if (comment.length > 280) {
        res.status(400).json({ message: "Comment must be 280 characters or less" });
        return;
    }

    // Verify pin exists
    const pin = db.query("SELECT id FROM pin WHERE id = ?", [pinID])[0];
    if (!pin) {
        res.status(404).json({ message: "Pin not found" });
        return;
    }

    const results = db.query(
        `
        INSERT INTO comment(pinID, accountID, comment, createdAt)
        VALUES(?, ?, ?, datetime('now'))
        RETURNING id, pinID, accountID, comment, createdAt;
        `,
        [pinID, userID, comment.trim()]
    );

    if (results.length > 0) {
        // Fetch the user email to return complete comment data
        const userEmail = db.query("SELECT email FROM account WHERE id = ?", [userID])[0]?.email;
        res.status(201).json({
            ...results[0],
            email: userEmail
        });
    } else {
        res.status(500).json({ message: "Failed to create comment" });
    }
}

// Delete a comment (only by the comment author)
export function deleteComment(req: Request, res: Response) {
    const commentID = req.params.commentId;
    const userID = req.user.id;

    // Check if comment exists and user owns it
    const comment = db.query(
        "SELECT accountID FROM comment WHERE id = ?",
        [commentID]
    )[0];

    if (!comment) {
        res.status(404).json({ message: "Comment not found" });
        return;
    }

    if (comment.accountID !== userID) {
        res.status(403).json({ message: "Unauthorized to delete this comment" });
        return;
    }

    const result = db.query("DELETE FROM comment WHERE id = ?", [commentID]);
    
    if ((result as any).changes > 0) {
        res.status(200).json({ message: "Comment deleted successfully" });
    } else {
        res.status(500).json({ message: "Failed to delete comment" });
    }
}

// Update a comment (only by the comment author)
export function updateComment(req: Request, res: Response) {
    const commentID = req.params.commentId;
    const { comment } = req.body;
    const userID = req.user.id;

    if (!comment || comment.trim().length === 0) {
        res.status(400).json({ message: "Comment text is required" });
        return;
    }

    if (comment.length > 280) {
        res.status(400).json({ message: "Comment must be 280 characters or less" });
        return;
    }

    // Check if comment exists and user owns it
    const existingComment = db.query(
        "SELECT accountID FROM comment WHERE id = ?",
        [commentID]
    )[0];

    if (!existingComment) {
        res.status(404).json({ message: "Comment not found" });
        return;
    }

    if (existingComment.accountID !== userID) {
        res.status(403).json({ message: "Unauthorized to update this comment" });
        return;
    }

    db.query(
        "UPDATE comment SET comment = ? WHERE id = ?",
        [comment.trim(), commentID]
    );

    const updatedComment = db.query(
        `
        SELECT 
            c.id,
            c.pinID,
            c.accountID,
            c.comment,
            c.createdAt,
            a.email
        FROM comment c
        JOIN account a ON a.id = c.accountID
        WHERE c.id = ?
        `,
        [commentID]
    )[0];

    res.json(updatedComment);
}
