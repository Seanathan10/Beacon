/**
 * Parse a keyset-pagination cursor from a query param.
 * Returns `null` when absent, a positive int when valid, or `"invalid"` when
 * present but unusable (the caller should respond 400).
 */
export function parseCursor(raw: unknown, max: number): number | null | "invalid" {
    if (raw === undefined) return null;
    const parsed = parseInt(String(raw), 10);
    if (isNaN(parsed) || parsed < 1 || parsed > max) return "invalid";
    return parsed;
}
