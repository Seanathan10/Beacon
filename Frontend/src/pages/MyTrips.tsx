import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { BASE_API_URL } from "../../constants";

interface TripSummary {
    origin: string | null;
    destination: string | null;
    itineraryType: string | null;
    durationDays: number | null;
}

interface TripItem {
    id: string;
    title: string | null;
    isPublic: boolean;
    createdAt: string;
    summary: TripSummary;
}

function tripLabel(t: TripItem): string {
    if (t.title) return t.title;
    const { origin, destination } = t.summary;
    if (origin && destination) return `${origin} → ${destination}`;
    if (destination) return `Trip to ${destination}`;
    return "Untitled trip";
}

function tripSubtitle(t: TripItem): string {
    const parts: string[] = [];
    if (t.summary.itineraryType) parts.push(t.summary.itineraryType);
    if (t.summary.durationDays) parts.push(`${t.summary.durationDays} days`);
    return parts.join(" • ");
}

export default function MyTrips() {
    const [items, setItems] = useState<TripItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [nextCursor, setNextCursor] = useState<number | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const navigate = useNavigate();

    const load = useCallback(async (cursor: number | null, signal?: AbortSignal) => {
        const url = cursor
            ? `${BASE_API_URL}/api/me/trips?cursor=${cursor}`
            : `${BASE_API_URL}/api/me/trips`;
        const res = await fetch(url, { credentials: "include", signal });
        if (res.status === 401) { navigate("/"); return null; }
        return res.ok ? res.json() : null;
    }, [navigate]);

    useEffect(() => {
        const controller = new AbortController();
        (async () => {
            const data = await load(null, controller.signal);
            if (!data) { setLoading(false); return; }
            setItems(data.items);
            setNextCursor(data.nextCursor);
            setHasMore(data.hasMore);
            setLoading(false);
        })().catch(() => setLoading(false));
        return () => controller.abort();
    }, [load]);

    const loadMore = async () => {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const data = await load(nextCursor);
            if (data) {
                setItems((prev) => [...prev, ...data.items]);
                setNextCursor(data.nextCursor);
                setHasMore(data.hasMore);
            }
        } finally {
            setLoadingMore(false);
        }
    };

    const deleteTrip = async (id: string) => {
        if (deletingId) return;
        if (!window.confirm("Delete this trip? This cannot be undone.")) return;
        setDeletingId(id);
        try {
            const res = await fetch(`${BASE_API_URL}/api/share/${id}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (res.ok) {
                setItems((prev) => prev.filter((t) => t.id !== id));
            }
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0 }}>←</button>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>My Trips</h1>
            </div>

            {loading && (
                <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>Loading...</div>
            )}

            {!loading && items.length === 0 && (
                <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>🧳</div>
                    <p>No saved trips yet.</p>
                    <a href="/home" style={{ color: "#2563eb", textDecoration: "none" }}>Plan a trip →</a>
                </div>
            )}

            {!loading && items.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {items.map((t) => {
                        const subtitle = tripSubtitle(t);
                        return (
                            <div key={t.id} style={{
                                display: "flex", alignItems: "center", gap: 12, padding: 14,
                                border: "1px solid #e5e7eb", borderRadius: 10, background: "var(--card-bg, #fff)",
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 15, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {tripLabel(t)}
                                        </span>
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999,
                                            background: t.isPublic ? "#dcfce7" : "#f3f4f6",
                                            color: t.isPublic ? "#166534" : "#6b7280",
                                            flexShrink: 0,
                                        }}>
                                            {t.isPublic ? "SHARED" : "DRAFT"}
                                        </span>
                                    </div>
                                    {subtitle && (
                                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{subtitle}</div>
                                    )}
                                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                                        {new Date(t.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <button
                                    onClick={() => navigate(`/my-trips/${t.id}`)}
                                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 13, flexShrink: 0 }}
                                >
                                    Open
                                </button>
                                <button
                                    onClick={() => deleteTrip(t.id)}
                                    disabled={deletingId === t.id}
                                    title="Delete trip"
                                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", cursor: "pointer", fontSize: 13, flexShrink: 0 }}
                                >
                                    {deletingId === t.id ? "..." : "🗑"}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {!loading && hasMore && (
                <div style={{ textAlign: "center", marginTop: 16 }}>
                    <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 13 }}
                    >
                        {loadingMore ? "Loading..." : "Load more"}
                    </button>
                </div>
            )}
        </div>
    );
}
