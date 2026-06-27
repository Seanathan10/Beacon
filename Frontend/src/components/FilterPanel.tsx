import { useState, useEffect } from "react";
import "./styles/FilterPanel.css";

const TAGS = ["New", "Local", "Trendy", "Eatery", "Hot", "Scenic"];

export interface PinFilters {
    tags: string[];
    minDate: string;
    maxDate: string;
    minRating: number | null;
    maxRating: number | null;
    bookmarkStatus: "" | "bookmarked" | "visited" | "wishlist";
}

export const DEFAULT_FILTERS: PinFilters = {
    tags: [],
    minDate: "",
    maxDate: "",
    minRating: null,
    maxRating: null,
    bookmarkStatus: "",
};

const STORAGE_KEY = "beacon-pin-filters";

export function loadSavedFilters(): PinFilters {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_FILTERS;
        return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
    } catch {
        return DEFAULT_FILTERS;
    }
}

function saveFilters(filters: PinFilters) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
        // non-fatal
    }
}

function hasActiveFilters(filters: PinFilters): boolean {
    return (
        filters.tags.length > 0 ||
        !!filters.minDate ||
        !!filters.maxDate ||
        filters.minRating !== null ||
        filters.maxRating !== null ||
        !!filters.bookmarkStatus
    );
}

interface FilterPanelProps {
    isLoggedIn: boolean;
    onApply: (filters: PinFilters) => void;
}

export default function FilterPanel({ isLoggedIn, onApply }: FilterPanelProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [draft, setDraft] = useState<PinFilters>(loadSavedFilters);
    const [applied, setApplied] = useState<PinFilters>(loadSavedFilters);

    // Apply saved filters on mount
    useEffect(() => {
        const saved = loadSavedFilters();
        if (hasActiveFilters(saved)) {
            onApply(saved);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function toggleTag(tag: string) {
        setDraft(prev => ({
            ...prev,
            tags: prev.tags.includes(tag)
                ? prev.tags.filter(t => t !== tag)
                : [...prev.tags, tag],
        }));
    }

    function handleApply() {
        setApplied(draft);
        saveFilters(draft);
        onApply(draft);
        setIsOpen(false);
    }

    function handleClear() {
        setDraft(DEFAULT_FILTERS);
        setApplied(DEFAULT_FILTERS);
        saveFilters(DEFAULT_FILTERS);
        onApply(DEFAULT_FILTERS);
        setIsOpen(false);
    }

    const active = hasActiveFilters(applied);

    return (
        <div className="filter-panel-wrapper">
            <button
                type="button"
                className={`filter-toggle ${active ? "filter-toggle--active" : ""}`}
                onClick={() => setIsOpen(o => !o)}
                aria-expanded={isOpen}
                title="Filter pins"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                    <line x1="11" y1="18" x2="13" y2="18" />
                </svg>
                Filters
                {active && <span className="filter-active-dot" />}
            </button>

            {isOpen && (
                <div className="filter-panel">
                    <section className="filter-section">
                        <span className="filter-label">Tags</span>
                        <div className="filter-tags">
                            {TAGS.map(tag => (
                                <button
                                    key={tag}
                                    type="button"
                                    className={`filter-tag ${draft.tags.includes(tag) ? "filter-tag--active" : ""}`}
                                    onClick={() => toggleTag(tag)}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="filter-section">
                        <span className="filter-label">Date range</span>
                        <div className="filter-row">
                            <label className="filter-date-label">
                                From
                                <input
                                    type="date"
                                    className="filter-date-input"
                                    value={draft.minDate}
                                    onChange={e => setDraft(p => ({ ...p, minDate: e.target.value }))}
                                />
                            </label>
                            <label className="filter-date-label">
                                To
                                <input
                                    type="date"
                                    className="filter-date-input"
                                    value={draft.maxDate}
                                    onChange={e => setDraft(p => ({ ...p, maxDate: e.target.value }))}
                                />
                            </label>
                        </div>
                    </section>

                    <section className="filter-section">
                        <span className="filter-label">
                            Min likes
                            <span className="filter-value-hint">
                                {draft.minRating !== null ? ` (${draft.minRating}+)` : " (any)"}
                            </span>
                        </span>
                        <input
                            type="range"
                            min={0}
                            max={50}
                            value={draft.minRating ?? 0}
                            className="filter-range"
                            onChange={e => {
                                const val = parseInt(e.target.value, 10);
                                setDraft(p => ({ ...p, minRating: val === 0 ? null : val }));
                            }}
                        />
                        <div className="filter-range-labels">
                            <span>0</span>
                            <span>50+</span>
                        </div>
                    </section>

                    <section className="filter-section">
                        <span className="filter-label">
                            Max likes
                            <span className="filter-value-hint">
                                {draft.maxRating !== null ? ` (${draft.maxRating} or fewer)` : " (any)"}
                            </span>
                        </span>
                        <input
                            type="range"
                            min={0}
                            max={50}
                            value={draft.maxRating ?? 50}
                            className="filter-range"
                            onChange={e => {
                                const val = parseInt(e.target.value, 10);
                                setDraft(p => ({ ...p, maxRating: val === 50 ? null : val }));
                            }}
                        />
                        <div className="filter-range-labels">
                            <span>0</span>
                            <span>50+</span>
                        </div>
                    </section>

                    {isLoggedIn && (
                        <section className="filter-section">
                            <span className="filter-label">Status</span>
                            <select
                                className="filter-select"
                                value={draft.bookmarkStatus}
                                onChange={e => setDraft(p => ({ ...p, bookmarkStatus: e.target.value as PinFilters["bookmarkStatus"] }))}
                            >
                                <option value="">All pins</option>
                                <option value="bookmarked">Bookmarked</option>
                                <option value="visited">Visited</option>
                                <option value="wishlist">Wishlist</option>
                            </select>
                        </section>
                    )}

                    <div className="filter-actions">
                        <button type="button" className="filter-btn-clear" onClick={handleClear}>
                            Clear
                        </button>
                        <button type="button" className="filter-btn-apply" onClick={handleApply}>
                            Apply
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
