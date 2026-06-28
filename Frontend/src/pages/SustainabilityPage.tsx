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

const OFFSET_URL = "https://www.goldstandard.org/take-action/offset-your-emissions";

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
                        {d.month.slice(2)}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function SustainabilityPage() {
    const [stats, setStats] = useState<CarbonStats | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const load = useCallback(async (signal?: AbortSignal) => {
        const res = await fetch(`${BASE_API_URL}/api/me/carbon-stats`, { credentials: "include", signal });
        if (res.status === 401) { navigate("/"); return null; }
        return res.ok ? res.json() : null;
    }, [navigate]);

    useEffect(() => {
        const controller = new AbortController();
        (async () => {
            const data = await load(controller.signal);
            if (data) setStats(data);
            setLoading(false);
        })().catch(() => setLoading(false));
        return () => controller.abort();
    }, [load]);

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
        </div>
    );
}
