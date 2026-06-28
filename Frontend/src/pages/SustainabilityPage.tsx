import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { BASE_API_URL } from "../../constants";

interface MonthPoint {
    month: string;
    count: number;
    carbonKg: number;
    savedKg: number;
}

interface CarbonStats {
    tripCount: number;
    totalCarbonKg: number;
    totalSavedKg: number;
    avgSavingsPct: number;
    offsetCostUsd: number;
    byMonth: MonthPoint[];
}

interface Challenge {
    id: number;
    title: string;
    description: string | null;
    goal: number;
    icon: string | null;
    progress: number;
    completed: boolean;
}

interface LeaderRow {
    rank: number;
    accountID: number;
    name: string | null;
    avatar: string | null;
    totalSavedKg: number;
    tripCount: number;
}

const OFFSET_URL = "https://www.goldstandard.org/take-action/offset-your-emissions";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatMonth(ym: string): string {
    const [year, month] = ym.split("-");
    const abbr = MONTH_ABBR[parseInt(month, 10) - 1];
    return abbr ? `${abbr} '${year.slice(2)}` : ym;
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
    return (
        <div style={{ flex: "1 1 120px", minWidth: 120, padding: 14, border: "1px solid #e5e7eb", borderRadius: 10, background: "var(--card-bg, #fff)" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? "#111827" }}>{value}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{label}</div>
        </div>
    );
}

function MonthlyChart({ data }: { data: MonthPoint[] }) {
    const max = Math.max(1, ...data.map((d) => d.savedKg));
    return (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, padding: "8px 0" }}>
            {data.map((d) => (
                <div key={d.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>{Math.round(d.savedKg)}</div>
                    <div
                        title={`${d.savedKg} kg saved across ${d.count} trip(s)`}
                        style={{
                            width: "100%", maxWidth: 32,
                            height: `${Math.max(4, (d.savedKg / max) * 100)}px`,
                            background: "linear-gradient(to top, #22c55e, #86efac)",
                            borderRadius: "4px 4px 0 0",
                        }}
                    />
                    <div style={{ fontSize: 10, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 44 }}>
                        {formatMonth(d.month)}
                    </div>
                </div>
            ))}
        </div>
    );
}

function ChallengeRow({ c }: { c: Challenge }) {
    const pct = Math.min(100, Math.round((c.progress / c.goal) * 100));
    return (
        <div style={{ padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{c.icon ?? "🎯"}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{c.title}</span>
                {c.completed && <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a" }}>✓ Done</span>}
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
                    {Math.min(c.progress, c.goal)} / {c.goal}
                </span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "#f3f4f6", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: c.completed ? "#16a34a" : "#86efac", transition: "width 0.3s" }} />
            </div>
            {c.description && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{c.description}</div>}
        </div>
    );
}

export default function SustainabilityPage() {
    const [stats, setStats] = useState<CarbonStats | null>(null);
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [leaders, setLeaders] = useState<LeaderRow[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const fetchJson = useCallback(async (path: string, signal?: AbortSignal) => {
        const res = await fetch(`${BASE_API_URL}${path}`, { credentials: "include", signal });
        if (res.status === 401) { navigate("/"); return null; }
        return res.ok ? res.json() : null;
    }, [navigate]);

    useEffect(() => {
        const controller = new AbortController();
        (async () => {
            const [statsData, challengeData, leaderData] = await Promise.all([
                fetchJson("/api/me/carbon-stats", controller.signal),
                fetchJson("/api/me/challenges", controller.signal),
                fetchJson("/api/leaderboard", controller.signal),
            ]);
            if (statsData) setStats(statsData);
            if (challengeData) setChallenges(challengeData.items);
            if (leaderData) setLeaders(leaderData.items);
            setLoading(false);
        })().catch(() => setLoading(false));
        return () => controller.abort();
    }, [fetchJson]);

    return (
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0 }}>←</button>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>🌱 Sustainability</h1>
            </div>

            {loading && <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>Loading...</div>}

            {!loading && (!stats || stats.tripCount === 0) && (
                <div style={{ textAlign: "center", color: "#6b7280", padding: 40 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>🌍</div>
                    <p>Plan and save a trip to start tracking your carbon savings.</p>
                    <a href="/home" style={{ color: "#16a34a", textDecoration: "none" }}>Plan a trip →</a>
                </div>
            )}

            {!loading && stats && stats.tripCount > 0 && (
                <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
                        <StatCard label="CO₂ saved" value={`${Math.round(stats.totalSavedKg)} kg`} accent="#16a34a" />
                        <StatCard label="Your footprint" value={`${Math.round(stats.totalCarbonKg)} kg`} />
                        <StatCard label="Avg savings" value={`${stats.avgSavingsPct}%`} accent="#16a34a" />
                        <StatCard label="Trips" value={String(stats.tripCount)} />
                    </div>

                    <div style={{ padding: 16, border: "1px solid #d1fae5", borderRadius: 10, background: "var(--card-bg, #f0fdf4)", marginBottom: 20 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#065f46", marginBottom: 4 }}>Offset your remaining footprint</div>
                        <div style={{ fontSize: 13, color: "#047857", marginBottom: 10 }}>
                            Roughly <strong>${stats.offsetCostUsd}</strong> would offset your {Math.round(stats.totalCarbonKg)} kg of travel emissions.
                        </div>
                        <a href={OFFSET_URL} target="_blank" rel="noopener noreferrer"
                           style={{ display: "inline-block", padding: "8px 14px", borderRadius: 8, background: "#16a34a", color: "#fff", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
                            Offset now →
                        </a>
                    </div>

                    {stats.byMonth.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>Monthly CO₂ saved</h2>
                            <MonthlyChart data={stats.byMonth} />
                        </div>
                    )}
                </>
            )}

            {!loading && challenges.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>Eco-challenges</h2>
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "0 14px", background: "var(--card-bg, #fff)" }}>
                        {challenges.map((c) => <ChallengeRow key={c.id} c={c} />)}
                    </div>
                </div>
            )}

            {!loading && leaders.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>Leaderboard</h2>
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "var(--card-bg, #fff)" }}>
                        {leaders.map((l) => (
                            <a key={l.accountID} href={`/profile/${l.accountID}`}
                               style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid #f3f4f6", textDecoration: "none", color: "inherit" }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: "#6b7280", width: 24 }}>#{l.rank}</span>
                                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, overflow: "hidden", flexShrink: 0 }}>
                                    {l.avatar ? <img src={l.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (l.name?.[0]?.toUpperCase() ?? "?")}
                                </div>
                                <span style={{ flex: 1, fontSize: 14, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {l.name ?? "Traveler"}
                                </span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "#16a34a" }}>{Math.round(l.totalSavedKg)} kg</span>
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
