/** Bookmarked pin ids keyed by user email, persisted in localStorage. */
export function getSavedPins(): Record<string, number[]> {
    try {
        return JSON.parse(localStorage.getItem("savedPins") || "{}");
    } catch {
        return {};
    }
}

export function setSavedPins(saved: Record<string, number[]>): void {
    localStorage.setItem("savedPins", JSON.stringify(saved));
}
