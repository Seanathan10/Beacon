/**
 * Notification creation helper.
 *
 * Notifications are written as a side-effect of social actions (like, follow,
 * comment, upvote). Creation must never break the originating request, so
 * `createNotification` swallows and logs its own errors rather than throwing.
 */
import * as notificationRepo from "../repositories/notificationRepo";

export type NotificationType =
    | "pin_like"
    | "follow"
    | "pin_comment"
    | "post_upvote"
    | "challenge_complete";

export type EntityType = "pin" | "post" | "account" | "comment" | "challenge";

interface CreateNotificationArgs {
    recipientID: number;
    // null for system-generated notifications (e.g. completing a challenge).
    actorID: number | null;
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
        notificationRepo.insert(recipientID, actorID, type, entityType, entityID);
    } catch (err) {
        // Notifications are best-effort; never let a failure surface to the caller.
        console.error("Failed to create notification:", err);
    }
}
