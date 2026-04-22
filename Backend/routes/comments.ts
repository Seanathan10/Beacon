import { Request, Response } from "express";
import * as db from "../database/db";

// Get all comments for a specific pin with reactions and badges
export function getPinComments(req: Request, res: Response) {
    const pinID = req.params.pinId;
    const userID = req.user?.id;
    
    // Get pin creator for badge comparison
    const pin = db.query("SELECT creatorID FROM pin WHERE id = ?", [pinID])[0];
    if (!pin) {
        res.status(404).json({ message: "Pin not found" });
        return;
    }
    
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
    
    // Enrich comments with reactions and badges
    const enrichedComments = results.map((comment: any) => {
        // Get reactions for this comment
        const reactions = db.query(
            `
            SELECT emoji, COUNT(*) as count
            FROM comment_reaction
            WHERE commentID = ?
            GROUP BY emoji
            `,
            [comment.id]
        );
        
        // Get user's reactions
        const userReactions = userID ? db.query(
            `
            SELECT emoji FROM comment_reaction
            WHERE commentID = ? AND accountID = ?
            `,
            [comment.id, userID]
        ).map((r: any) => r.emoji) : [];
        
        // Check if user has liked this pin
        const hasLiked = userID ? db.query(
            "SELECT 1 FROM likes WHERE pinID = ? AND accountID = ?",
            [pinID, userID]
        ).length > 0 : false;
        
        return {
            ...comment,
            isCreator: comment.accountID === pin.creatorID,
            hasLiked,
            reactions: reactions.map((r: any) => ({
                emoji: r.emoji,
                count: r.count,
                userReacted: userReactions.includes(r.emoji)
            }))
        };
    });
    
    res.json(enrichedComments);
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
            email: userEmail,
            isCreator: false,
            hasLiked: false,
            reactions: []
        });
    } else {
        res.status(500).json({ message: "Failed to create comment" });
    }
}

// Delete a comment (only by the comment author)
export function deleteComment(req: Request, res: Response) {
    const commentID = req.params.commentId;
    const userID = req.user.id;

    // Check if comment exists AND user owns it
    // First, select the comment
    const commentList = db.query("SELECT accountID FROM comment WHERE id = ?", [commentID]);
    
    if (commentList.length === 0) {
        res.status(404).json({ message: "Comment not found" });
        return;
    }
    
    const comment = commentList[0];

    if (Number(comment.accountID) !== Number(userID)) {
        res.status(403).json({ message: "Unauthorized to delete this comment" });
        return;
    }

    // Use db.prepare().run() for DELETE to get changes count
    // NOTE: In our test DB wrapper, db.query handles this if we don't start with SELECT
    const result = db.query("DELETE FROM comment WHERE id = ?", [commentID]);
    
    if (result.changes > 0) {
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

    if (Number(existingComment.accountID) !== Number(userID)) {
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

    if (!updatedComment) {
        return res.status(404).json({ message: "Comment not found" });
    }

    res.json({
        ...updatedComment,
        isCreator: false,
        hasLiked: false,
        reactions: []
    });
}

// Add a reaction to a comment (idempotent)
export function addCommentReaction(req: Request, res: Response) {
    const commentID = req.params.id;
    const userID = req.user.id;
    const { emoji } = req.body;

    if (!emoji || typeof emoji !== 'string' || emoji.length === 0) {
        res.status(400).json({ message: "Emoji is required" });
        return;
    }

    // Verify comment exists
    const comment = db.query("SELECT id FROM comment WHERE id = ?", [commentID])[0];
    if (!comment) {
        res.status(404).json({ message: "Comment not found" });
        return;
    }

    try {
        // Idempotent insert: ignore if already exists
        db.query(
            "INSERT OR IGNORE INTO comment_reaction(commentID, accountID, emoji, createdAt) VALUES(?, ?, ?, datetime('now'))",
            [commentID, userID, emoji]
        );
        res.status(201).json({ message: "Reaction added" });
    } catch (error) {
        console.error("Reaction error:", error);
        res.status(500).json({ message: "Failed to add reaction" });
    }
}

// Remove a reaction from a comment
export function removeCommentReaction(req: Request, res: Response) {
    const commentID = req.params.id;
    const emoji = req.params.emoji;
    const userID = req.user.id;

    // Verify comment exists
    const comment = db.query("SELECT id FROM comment WHERE id = ?", [commentID])[0];
    if (!comment) {
        res.status(404).json({ message: "Comment not found" });
        return;
    }

    const result = db.query(
        "DELETE FROM comment_reaction WHERE commentID = ? AND accountID = ? AND emoji = ?",
        [commentID, userID, emoji]
    );

    if (result.changes > 0) {
        res.status(200).json({ message: "Reaction removed" });
    } else {
        res.status(404).json({ message: "Reaction not found" });
    }
}
