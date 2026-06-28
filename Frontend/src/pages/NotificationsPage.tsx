import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { BASE_API_URL } from "../../constants";

interface NotificationItem {
    id: number;
    type: string;
    entityType: string | null;
    entityID: number | null;
    isRead: boolean;
    createdAt: string;
    actorID: number | null;
    actorName: string | null;
    actorEmail: string | null;
    actorAvatar: string | null;
}

const TYPE_ICON: Record<string, string> = {
    pin_like: "❤️",
    follow: "➕",
    pin_comment: "💬",
    post_upvote: "⬆️",
    challenge_complete: "🏆",
};

function actorLabel(n: NotificationItem): string {
    // Challenge completions are system-generated (no actor).
    if (n.type === "challenge_complete") return "You";
    return n.actorName || n.actorEmail || "Someone";
}

function describe(n: NotificationItem): string {
    switch (n.type) {
        case "pin_like": return "liked your pin";
        case "follow": return "started following you";
        case "pin_comment": return "commented on your pin";
        case "post_upvote": return "upvoted your post";
        case "challenge_complete": return "completed an eco-challenge!";
        default: return n.type;
    }
}

function linkFor(n: NotificationItem): string | null {
    if (n.type === "challenge_complete") return "/sustainability";
    if (n.type === "follow" && n.actorID) return `/profile/${n.actorID}`;
    if (n.entityType === "pin" && n.entityID) return `/home?pin=${n.entityID}`;
    if (n.entityType === "post" && n.entityID) return `/explore`;
    return null;
}

export default function NotificationsPage() {
    const [items, setItems] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [nextCursor, setNextCursor] = useState<number | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const navigate = useNavigate();

    const load = useCallback(async (cursor: number | null, signal?: AbortSignal) => {
        const url = cursor
            ? `${BASE_API_URL}/api/notifications?cursor=${cursor}`
            : `${BASE_API_URL}/api/notifications`;
        const res = await fetch(url, { credentials: "include", signal });
        if (res.status === 401) { navigate("/"); return null; }
        return res.ok ? res.json() : null;
    }, [navigate]);

    // Initial load, then mark everything read so the bell badge clears.
    useEffect(() => {
        const controller = new AbortController();
        (async () => {
            const data = await load(null, controller.signal);
            if (!data) { setLoading(false); return; }
            setItems(data.items);
            setNextCursor(data.nextCursor);
            setHasMore(data.hasMore);
            setLoading(false);
            // Mark all read (best-effort) without blocking render.
            fetch(`${BASE_API_URL}/api/notifications/read`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            }).catch(() => {});
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

    return (
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0 }}>←</button>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Notifications</h1>
            </div>

            {loading && (
                <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>Loading...</div>
            )}

            {!loading && items.length === 0 && (
                <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>🔔</div>
                    <p>No notifications yet.</p>
                </div>
            )}

            {!loading && items.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {items.map((n) => {
                        const href = linkFor(n);
                        const row = (
                            <div style={{
                                display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 8px",
                                borderBottom: "1px solid #f3f4f6",
                                background: n.isRead ? "transparent" : "var(--unread-bg, #eff6ff)",
                                borderRadius: 6,
                            }}>
                                <div style={{ fontSize: 18, flexShrink: 0, width: 28, textAlign: "center" }}>
                                    {TYPE_ICON[n.type] ?? "•"}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, color: "#374151" }}>
                                        <strong>{actorLabel(n)}</strong> {describe(n)}
                                    </div>
                                </div>
                                <div style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
                                    {new Date(n.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                        );
                        return href ? (
                            <a key={n.id} href={href} style={{ textDecoration: "none", color: "inherit" }}>{row}</a>
                        ) : (
                            <div key={n.id}>{row}</div>
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
