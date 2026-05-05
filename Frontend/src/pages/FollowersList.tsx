import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { BASE_API_URL } from "../../constants";

interface UserSummary {
    id: number;
    name: string;
    email: string;
    bio: string | null;
    avatar: string | null;
    followerCount: number;
    isFollowed: boolean;
}

type ListType = "followers" | "following";

function UserList({ userID, type }: { userID: string; type: ListType }) {
    const [users, setUsers] = useState<UserSummary[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`${BASE_API_URL}/api/users/${userID}/${type}?page=${page}`, { credentials: "include" })
            .then((r) => r.json())
            .then((data) => {
                const list = data[type] ?? data.followers ?? data.following ?? [];
                setUsers((prev) => page === 1 ? list : [...prev, ...list]);
                setHasMore(data.hasMore);
                setLoading(false);
            });
    }, [userID, type, page]);

    async function toggleFollow(target: UserSummary) {
        const method = target.isFollowed ? "DELETE" : "POST";
        await fetch(`${BASE_API_URL}/api/users/${target.id}/follow`, {
            method,
            credentials: "include",
        });
        setUsers((prev) =>
            prev.map((u) =>
                u.id === target.id
                    ? { ...u, isFollowed: !u.isFollowed, followerCount: u.followerCount + (u.isFollowed ? -1 : 1) }
                    : u
            )
        );
    }

    if (loading && page === 1) return <p>Loading...</p>;

    return (
        <div>
            {users.length === 0 && <p style={{ color: "#888", textAlign: "center", marginTop: 32 }}>No users found.</p>}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {users.map((u) => (
                    <li key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border-color, #eee)" }}>
                        <Link to={`/profile/${u.id}`} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, textDecoration: "none", color: "inherit" }}>
                            {u.avatar ? (
                                <img src={u.avatar} alt={u.name} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />
                            ) : (
                                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
                                    {u.name?.[0]?.toUpperCase() ?? "?"}
                                </div>
                            )}
                            <div>
                                <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{u.name}</p>
                                <p style={{ margin: 0, fontSize: 12, color: "#888" }}>{u.followerCount} followers</p>
                                {u.bio && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#666" }}>{u.bio.slice(0, 60)}{u.bio.length > 60 ? "…" : ""}</p>}
                            </div>
                        </Link>
                        <button
                            onClick={() => toggleFollow(u)}
                            style={{
                                padding: "6px 14px",
                                borderRadius: 8,
                                border: "none",
                                background: u.isFollowed ? "#e5e7eb" : "#22c55e",
                                color: u.isFollowed ? "#111" : "#fff",
                                cursor: "pointer",
                                fontSize: 13,
                                fontWeight: 600,
                                flexShrink: 0,
                            }}
                        >
                            {u.isFollowed ? "Unfollow" : "Follow"}
                        </button>
                    </li>
                ))}
            </ul>
            {hasMore && (
                <button
                    onClick={() => setPage((p) => p + 1)}
                    style={{ display: "block", margin: "16px auto", padding: "8px 24px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer", background: "none" }}
                >
                    Load more
                </button>
            )}
        </div>
    );
}

export function FollowersList() {
    const { userID } = useParams<{ userID: string }>();
    const navigate = useNavigate();

    return (
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>
            <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#22c55e", padding: "0 0 16px", fontWeight: 500 }}>
                ← Back
            </button>
            <h2 style={{ margin: "0 0 20px" }}>Followers</h2>
            {userID && <UserList userID={userID} type="followers" />}
        </div>
    );
}

export function FollowingList() {
    const { userID } = useParams<{ userID: string }>();
    const navigate = useNavigate();

    return (
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }}>
            <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#22c55e", padding: "0 0 16px", fontWeight: 500 }}>
                ← Back
            </button>
            <h2 style={{ margin: "0 0 20px" }}>Following</h2>
            {userID && <UserList userID={userID} type="following" />}
        </div>
    );
}
