/**
 * Derive the persisted per-trip carbon figures from a trip's `settings` blob
 * (which carries the carbonStats computed during planning). Returns nulls when
 * the data is absent or malformed so older/partial trips simply don't count
 * toward the sustainability dashboard rather than poisoning the aggregates.
 *
 * - carbonKg: emissions of the chosen (best) transit option.
 * - savedKg:  absolute kg saved versus a typical tourist, never negative.
 */
export function deriveTripCarbon(settings: unknown): { carbonKg: number | null; savedKg: number | null } {
    const stats = (settings as any)?.carbonStats;
    const best = Number(stats?.bestOption?.carbonKg);
    const typical = Number(stats?.typicalTouristKg);

    const carbonKg = Number.isFinite(best) ? Math.round(best * 100) / 100 : null;
    let savedKg: number | null = null;
    if (Number.isFinite(best) && Number.isFinite(typical)) {
        savedKg = Math.max(0, Math.round((typical - best) * 100) / 100);
    }
    return { carbonKg, savedKg };
}
