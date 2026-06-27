/**
 * Notification creation helper.
 *
 * Notifications are written as a side-effect of social actions (like, follow,
 * comment, upvote). Creation must never break the originating request, so
 * `createNotification` swallows and logs its own errors rather than throwing.
 */
import * as db from "../database/db";

export type NotificationType =
    | "pin_like"
    | "follow"
    | "pin_comment"
    | "post_upvote";

export type EntityType = "pin" | "post" | "account" | "comment";

interface CreateNotificationArgs {
    recipientID: number;
    actorID: number;
    type: NotificationType;
    entityType?: EntityType;
    entityID?: number;
}

/**
 * Insert a notification. No-ops when the actor is the recipient (you don't get
 * notified about your own actions). Errors are logged, never thrown.
 */
export function createNotification(args: CreateNotificationArgs): void {
    const { recipientID, actorID, type, entityType = null, entityID = null } = args;

    // Don't notify users about their own actions.
    if (recipientID === actorID) return;

    try {
        db.query(
            `INSERT INTO notification (recipientID, actorID, type, entityType, entityID)
             VALUES (?, ?, ?, ?, ?)`,
            [recipientID, actorID, type, entityType, entityID]
        );
    } catch (err) {
        // Notifications are best-effort; never let a failure surface to the caller.
        console.error("Failed to create notification:", err);
    }
}
