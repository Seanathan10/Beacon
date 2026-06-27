import { Request, Response } from "express";
import * as db from "../database/db";
import { logError } from "../utils/logger";
import { stripHtml } from "../utils/sanitize";

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

    // Batch-load reactions for all comments at once instead of querying per
    // comment (which was 3 queries × N comments). Reaction aggregates + the
    // viewer's own reactions + the pin-like check collapse to 3 total queries.
    const commentIDs: number[] = results.map((c: any) => c.id);
    const reactionsByComment = new Map<number, { emoji: string; count: number }[]>();
    const userReactedByComment = new Map<number, Set<string>>();

    if (commentIDs.length > 0) {
        const placeholders = commentIDs.map(() => "?").join(",");

        const reactionRows = db.query(
            `SELECT commentID, emoji, COUNT(*) as count
             FROM comment_reaction
             WHERE commentID IN (${placeholders})
             GROUP BY commentID, emoji`,
            commentIDs
        );
        for (const r of reactionRows) {
            const list = reactionsByComment.get(r.commentID) ?? [];
            list.push({ emoji: r.emoji, count: r.count });
            reactionsByComment.set(r.commentID, list);
        }

        if (userID) {
            const userRows = db.query(
                `SELECT commentID, emoji
                 FROM comment_reaction
                 WHERE accountID = ? AND commentID IN (${placeholders})`,
                [userID, ...commentIDs]
            );
            for (const r of userRows) {
                const set = userReactedByComment.get(r.commentID) ?? new Set<string>();
                set.add(r.emoji);
                userReactedByComment.set(r.commentID, set);
            }
        }
    }

    // hasLiked is per-pin, identical for every comment — compute it once.
    const hasLiked = userID ? db.query(
        "SELECT 1 FROM likes WHERE pinID = ? AND accountID = ?",
        [pinID, userID]
    ).length > 0 : false;

    const enrichedComments = results.map((comment: any) => {
        const reactions = reactionsByComment.get(comment.id) ?? [];
        const userReacted = userReactedByComment.get(comment.id) ?? new Set<string>();
        return {
            ...comment,
            isCreator: comment.accountID === pin.creatorID,
            hasLiked,
            reactions: reactions.map((r) => ({
                emoji: r.emoji,
                count: r.count,
                userReacted: userReacted.has(r.emoji)
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
        [pinID, userID, stripHtml(comment.trim())]
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
        [stripHtml(comment.trim()), commentID]
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

    // Validate: must fit the VARCHAR(8) column and be a single emoji grapheme.
    // (Without this, SQLite silently truncates oversized input at 8 bytes.)
    if (emoji.length > 8) {
        res.status(400).json({ message: "Emoji must be 8 characters or less" });
        return;
    }
    const codepoints = Array.from(emoji);
    if (codepoints.length > 1 && !/\p{Emoji}/u.test(emoji)) {
        res.status(400).json({ message: "Reaction must be a single emoji" });
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
        logError(req, "Reaction error", error);
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
