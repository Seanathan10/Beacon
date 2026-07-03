/**
 * True when a resource owned by `ownerId` belongs to `userId`.
 *
 * Centralises the ownership comparison that route handlers repeat before
 * allowing a mutating action. A null/undefined owner (e.g. a seeded row with no
 * creator) is never owned by anyone. Both sides are coerced to numbers so a
 * string id from `req.params` compares equal to a numeric DB column.
 *
 * Callers keep responsibility for the "not found" (404) vs "forbidden" (403)
 * distinction, since that policy differs per resource.
 */
export function isOwner(ownerId: unknown, userId: unknown): boolean {
    return ownerId != null && Number(ownerId) === Number(userId);
}
