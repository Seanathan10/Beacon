import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { BASE_API_URL } from "../../constants";

interface ActivityItem {
    type: "pin_created" | "comment_added" | "place_visited";
    relatedID: number;
    summary: string;
    createdAt: string;
}

const TYPE_ICON: Record<ActivityItem["type"], string> = {
    pin_created: "📍",
    comment_added: "💬",
    place_visited: "✅",
};

const TYPE_LABEL: Record<ActivityItem["type"], string> = {
    pin_created: "Created a pin",
    comment_added: "Left a comment",
    place_visited: "Visited a place",
};

export default function ActivityPage() {
    const [activity, setActivity] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetch(`${BASE_API_URL}/api/me/activity`, { credentials: "include" })
            .then(r => {
                if (r.status === 401) { navigate("/"); return null; }
                return r.ok ? r.json() : null;
            })
            .then(data => { if (data) setActivity(data); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [navigate]);

    return (
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0 }}>←</button>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Recent Activity</h1>
            </div>

            {loading && (
                <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>Loading...</div>
            )}

            {!loading && activity.length === 0 && (
                <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
                    <p>No activity in the last 30 days.</p>
                </div>
            )}

            {!loading && activity.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {activity.map((item, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
                            <div style={{ fontSize: 20, flexShrink: 0, width: 28, textAlign: "center" }}>
                                {TYPE_ICON[item.type] ?? "•"}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                                    {TYPE_LABEL[item.type] ?? item.type}
                                </div>
                                {item.summary && (
                                    <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {item.summary}
                                    </div>
                                )}
                            </div>
                            <div style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
                                {new Date(item.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
