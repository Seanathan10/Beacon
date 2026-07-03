import { Request, Response } from "express";
import * as commentRepo from "../repositories/commentRepo";
import * as pinRepo from "../repositories/pinRepo";
import * as likeRepo from "../repositories/likeRepo";
import * as userRepo from "../repositories/userRepo";
import { logError } from "../utils/logger";
import { stripHtml } from "../utils/sanitize";
import { isOwner } from "../utils/ownership";
import { createNotification } from "../services/notifications";

// Get all comments for a specific pin with reactions and badges
export function getPinComments(req: Request, res: Response) {
    const pinID = String(req.params.pinId);
    const userID = req.user?.id;

    // Get pin creator for badge comparison
    const pin = pinRepo.findOwner(pinID);
    if (!pin) {
        res.status(404).json({ message: "Pin not found" });
        return;
    }

    const results = commentRepo.findByPin(pinID);

    // Batch-load reactions for all comments at once instead of querying per
    // comment (which was 3 queries × N comments). Reaction aggregates + the
    // viewer's own reactions + the pin-like check collapse to 3 total queries.
    const commentIDs: number[] = results.map((c: any) => c.id);
    const reactionsByComment = new Map<number, { emoji: string; count: number }[]>();
    const userReactedByComment = new Map<number, Set<string>>();

    if (commentIDs.length > 0) {
        for (const r of commentRepo.findReactionCounts(commentIDs)) {
            const list = reactionsByComment.get(r.commentID) ?? [];
            list.push({ emoji: r.emoji, count: r.count });
            reactionsByComment.set(r.commentID, list);
        }

        if (userID) {
            for (const r of commentRepo.findUserReactions(userID, commentIDs)) {
                const set = userReactedByComment.get(r.commentID) ?? new Set<string>();
                set.add(r.emoji);
                userReactedByComment.set(r.commentID, set);
            }
        }
    }

    // hasLiked is per-pin, identical for every comment — compute it once.
    const hasLiked = userID ? likeRepo.hasLiked(pinID, userID) : false;

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
    const pinID = String(req.params.pinId);
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
    const pin = pinRepo.findOwner(pinID);
    if (!pin) {
        res.status(404).json({ message: "Pin not found" });
        return;
    }

    const newComment = commentRepo.insert(pinID, userID, stripHtml(comment.trim()));

    if (newComment) {
        // Notify the pin's creator that someone commented (best-effort).
        if (pin.creatorID != null) {
            createNotification({
                recipientID: Number(pin.creatorID),
                actorID: userID,
                type: "pin_comment",
                entityType: "pin",
                entityID: Number(pinID),
            });
        }
        // Fetch the user email to return complete comment data
        res.status(201).json({
            ...newComment,
            email: userRepo.findEmail(userID),
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
    const commentID = String(req.params.commentId);
    const userID = req.user.id;

    // Check if comment exists AND user owns it
    const comment = commentRepo.findOwner(commentID);

    if (!comment) {
        res.status(404).json({ message: "Comment not found" });
        return;
    }

    if (!isOwner(comment.accountID, userID)) {
        res.status(403).json({ message: "Unauthorized to delete this comment" });
        return;
    }

    const result = commentRepo.deleteById(commentID);

    if (result.changes > 0) {
        res.status(200).json({ message: "Comment deleted successfully" });
    } else {
        res.status(500).json({ message: "Failed to delete comment" });
    }
}

// Update a comment (only by the comment author)
export function updateComment(req: Request, res: Response) {
    const commentID = String(req.params.commentId);
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
    const existingComment = commentRepo.findOwner(commentID);

    if (!existingComment) {
        res.status(404).json({ message: "Comment not found" });
        return;
    }

    if (!isOwner(existingComment.accountID, userID)) {
        res.status(403).json({ message: "Unauthorized to update this comment" });
        return;
    }

    commentRepo.updateText(commentID, stripHtml(comment.trim()));

    const updatedComment = commentRepo.findById(commentID);

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
    const commentID = String(req.params.id);
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
    if (!commentRepo.exists(commentID)) {
        res.status(404).json({ message: "Comment not found" });
        return;
    }

    try {
        // Idempotent insert: ignore if already exists
        commentRepo.addReaction(commentID, userID, emoji);
        res.status(201).json({ message: "Reaction added" });
    } catch (error) {
        logError(req, "Reaction error", error);
        res.status(500).json({ message: "Failed to add reaction" });
    }
}

// Remove a reaction from a comment
export function removeCommentReaction(req: Request, res: Response) {
    const commentID = String(req.params.id);
    const emoji = String(req.params.emoji);
    const userID = req.user.id;

    // Verify comment exists
    if (!commentRepo.exists(commentID)) {
        res.status(404).json({ message: "Comment not found" });
        return;
    }

    const result = commentRepo.removeReaction(commentID, userID, emoji);

    if (result.changes > 0) {
        res.status(200).json({ message: "Reaction removed" });
    } else {
        res.status(404).json({ message: "Reaction not found" });
    }
}
