/**
 * Remove HTML tags from user-supplied text before persisting it.
 * Defense-in-depth against stored XSS — render paths should still escape output.
 */
export function stripHtml(str: string): string {
    return str.replace(/<[^>]*>/g, "");
}

/**
 * Recursively strip HTML tags from every string in a nested value (object,
 * array, or primitive) before persisting it. Used for AI-generated itinerary
 * blobs that are later rendered on the client.
 */
export function sanitizeDeep(value: unknown): unknown {
    if (typeof value === "string") {
        return stripHtml(value);
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeDeep);
    }
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = sanitizeDeep(v);
        }
        return out;
    }
    return value;
}
