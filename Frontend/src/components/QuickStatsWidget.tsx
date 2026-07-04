import { useEffect, useState } from "react";
import * as statsApi from "@/services/stats";

interface Stats {
    pinsCreated: number;
    likesReceived: number;
    placesVisited: number;
    wishlistCount: number;
    bookmarksCount: number;
    commentsCount: number;
    postsCount: number;
    followersCount: number;
    followingCount: number;
    influenceScore?: number;
}

export default function QuickStatsWidget() {
    const [stats, setStats] = useState<Stats | null>(null);

    useEffect(() => {
        statsApi.getMyStats<Stats>()
            .then(data => setStats(data))
            .catch(() => {});
    }, []);

    if (!stats) return null;

    const items = [
        { label: "Pins", value: stats.pinsCreated },
        { label: "Likes", value: stats.likesReceived },
        { label: "Visited", value: stats.placesVisited },
        { label: "Followers", value: stats.followersCount },
    ];

    return (
        <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border-color, #e5e7eb)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary, #6b7280)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Your Stats</span>
                <a href="/activity" style={{ fontSize: 11, color: "var(--accent, #3b82f6)", textDecoration: "none" }}>Activity →</a>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {items.map(({ label, value }) => (
                    <div key={label} style={{ background: "var(--bg-secondary, #f9fafb)", borderRadius: 8, padding: "6px 10px", textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary, #111827)" }}>{value}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary, #6b7280)" }}>{label}</div>
                    </div>
                ))}
            </div>
            {stats.influenceScore !== undefined && (
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary, #6b7280)", textAlign: "center" }}>
                    Influence score: <strong style={{ color: "var(--text-primary, #374151)" }}>{stats.influenceScore}</strong>
                </div>
            )}
        </div>
    );
}
