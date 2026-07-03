import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { BASE_API_URL } from "../../constants";
import EditProfileModal from "../components/EditProfileModal";

interface UserProfileData {
    id: number;
    name: string;
    email: string;
    bio: string | null;
    avatar: string | null;
    profileVisibility: "public" | "friends" | "private";
    followerCount: number;
    followingCount: number;
    isFollowed: boolean;
    isOwn: boolean;
}

interface Pin {
    id: number;
    title: string;
    image: string | null;
    description: string | null;
    latitude: number;
    longitude: number;
    likes: number;
    createdAt: string;
}

type Tab = "pins" | "bookmarks" | "activity";

export default function UserProfile() {
    const { userID } = useParams<{ userID: string }>();
    const navigate = useNavigate();

    const [profile, setProfile] = useState<UserProfileData | null>(null);
    const [pins, setPins] = useState<Pin[]>([]);
    const [activity, setActivity] = useState<{ type: string; summary: string; createdAt: string }[]>([]);
    const [tab, setTab] = useState<Tab>("pins");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [followLoading, setFollowLoading] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [pinsPage, setPinsPage] = useState(1);
    const [pinsHasMore, setPinsHasMore] = useState(false);

    useEffect(() => {
        if (!userID) return;
        setLoading(true);
        setError(null);
        fetch(`${BASE_API_URL}/api/users/${userID}`, { credentials: "include" })
            .then((r) => {
                if (r.status === 403) throw new Error("private");
                if (!r.ok) throw new Error("not_found");
                return r.json();
            })
            .then((data) => {
                setProfile(data);
                setLoading(false);
            })
            .catch((e) => {
                setError(e.message === "private" ? "This profile is private." : "User not found.");
                setLoading(false);
            });
    }, [userID]);

    useEffect(() => {
        if (!userID || tab !== "pins") return;
        fetch(`${BASE_API_URL}/api/users/${userID}/pins?page=${pinsPage}`, { credentials: "include" })
            .then((r) => r.json())
            .then((data) => {
                setPins((prev) => pinsPage === 1 ? data.pins : [...prev, ...data.pins]);
                setPinsHasMore(data.hasMore);
            });
    }, [userID, tab, pinsPage]);

    useEffect(() => {
        if (!profile?.isOwn || tab !== "activity") return;
        fetch(`${BASE_API_URL}/api/me/activity`, { credentials: "include" })
            .then((r) => r.json())
            .then(setActivity);
    }, [profile?.isOwn, tab]);

    async function toggleFollow() {
        if (!profile) return;
        setFollowLoading(true);
        const method = profile.isFollowed ? "DELETE" : "POST";
        await fetch(`${BASE_API_URL}/api/users/${profile.id}/follow`, {
            method,
            credentials: "include",
        });
        setProfile((p) =>
            p
                ? {
                      ...p,
                      isFollowed: !p.isFollowed,
                      followerCount: p.followerCount + (p.isFollowed ? -1 : 1),
                  }
                : p
        );
        setFollowLoading(false);
    }

    if (loading) return <div style={pageStyle}><p>Loading...</p></div>;
    if (error || !profile) return <div style={pageStyle}><p>{error ?? "Error loading profile."}</p></div>;

    return (
        <div style={pageStyle}>
            <button onClick={() => navigate(-1)} style={backBtnStyle}>← Back</button>

            {/* Header */}
            <div style={headerStyle}>
                {profile.avatar ? (
                    <img src={profile.avatar} alt={profile.name} style={avatarStyle} />
                ) : (
                    <div style={{ ...avatarStyle, background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 32, fontWeight: 700 }}>
                        {profile.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                )}
                <div style={{ flex: 1 }}>
                    <h1 style={{ margin: "0 0 4px", fontSize: 24 }}>{profile.name}</h1>
                    <p style={{ margin: "0 0 8px", color: "#888", fontSize: 14 }}>{profile.email}</p>
                    {profile.bio && <p style={{ margin: "0 0 12px", fontSize: 14 }}>{profile.bio}</p>}

                    <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
                        <Link to={`/users/${profile.id}/followers`} style={statLinkStyle}>
                            <strong>{profile.followerCount}</strong> followers
                        </Link>
                        <Link to={`/users/${profile.id}/following`} style={statLinkStyle}>
                            <strong>{profile.followingCount}</strong> following
                        </Link>
                    </div>

                    {profile.isOwn ? (
                        <button onClick={() => setShowEditModal(true)} style={editBtnStyle}>
                            Edit Profile
                        </button>
                    ) : (
                        <button
                            onClick={toggleFollow}
                            disabled={followLoading}
                            style={{ ...followBtnStyle, background: profile.isFollowed ? "#e5e7eb" : "#22c55e", color: profile.isFollowed ? "#111" : "#fff" }}
                        >
                            {followLoading ? "..." : profile.isFollowed ? "Unfollow" : "Follow"}
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div style={tabBarStyle}>
                <button
                    style={{ ...tabBtnStyle, borderBottom: tab === "pins" ? "2px solid #22c55e" : "2px solid transparent" }}
                    onClick={() => setTab("pins")}
                >
                    Pins
                </button>
                {profile.isOwn && (
                    <button
                        style={{ ...tabBtnStyle, borderBottom: tab === "activity" ? "2px solid #22c55e" : "2px solid transparent" }}
                        onClick={() => setTab("activity")}
                    >
                        Activity
                    </button>
                )}
            </div>

            {/* Tab content */}
            {tab === "pins" && (
                <div>
                    {pins.length === 0 ? (
                        <p style={{ color: "#888", textAlign: "center", marginTop: 32 }}>No pins yet.</p>
                    ) : (
                        <div style={gridStyle}>
                            {pins.map((pin) => (
                                <div key={pin.id} style={pinCardStyle} onClick={() => navigate(`/home?pin=${pin.id}`)}>
                                    {pin.image && (
                                        <img src={pin.image} alt={pin.title ?? ""} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: "8px 8px 0 0" }} />
                                    )}
                                    <div style={{ padding: "8px 12px 12px" }}>
                                        <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: 14 }}>{pin.title ?? "Untitled"}</p>
                                        <p style={{ margin: 0, fontSize: 12, color: "#888" }}>{pin.likes} likes</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {pinsHasMore && (
                        <button
                            onClick={() => setPinsPage((p) => p + 1)}
                            style={{ display: "block", margin: "16px auto", padding: "8px 24px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer", background: "none" }}
                        >
                            Load more
                        </button>
                    )}
                </div>
            )}

            {tab === "activity" && profile.isOwn && (
                <div>
                    {activity.length === 0 ? (
                        <p style={{ color: "#888", textAlign: "center", marginTop: 32 }}>No recent activity.</p>
                    ) : (
                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                            {activity.map((item, i) => (
                                <li key={i} style={{ padding: "12px 0", borderBottom: "1px solid var(--border-color, #eee)", fontSize: 14 }}>
                                    <strong>{item.type === "pin_created" ? "Created pin" : item.type === "comment_added" ? "Commented" : "Visited"}</strong>
                                    {" — "}
                                    {item.summary}
                                    <span style={{ color: "#888", fontSize: 12, marginLeft: 8 }}>
                                        {new Date(item.createdAt).toLocaleDateString()}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {showEditModal && (
                <EditProfileModal
                    currentBio={profile.bio}
                    currentAvatar={profile.avatar}
                    currentVisibility={profile.profileVisibility}
                    onClose={() => setShowEditModal(false)}
                    onSaved={(updated) => {
                        setProfile((p) => p ? { ...p, ...updated } : p);
                        setShowEditModal(false);
                    }}
                />
            )}
        </div>
    );
}

const pageStyle: React.CSSProperties = {
    maxWidth: 680,
    margin: "0 auto",
    padding: "24px 16px",
    fontFamily: "inherit",
};

const headerStyle: React.CSSProperties = {
    display: "flex",
    gap: 20,
    alignItems: "flex-start",
    marginBottom: 24,
};

const avatarStyle: React.CSSProperties = {
    width: 88,
    height: 88,
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0,
};

const statLinkStyle: React.CSSProperties = {
    fontSize: 14,
    color: "inherit",
    textDecoration: "none",
};

const editBtnStyle: React.CSSProperties = {
    padding: "7px 18px",
    borderRadius: 8,
    border: "1px solid var(--border-color, #ddd)",
    background: "none",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
};

const followBtnStyle: React.CSSProperties = {
    padding: "7px 18px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
};

const tabBarStyle: React.CSSProperties = {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid var(--border-color, #eee)",
    marginBottom: 20,
};

const tabBtnStyle: React.CSSProperties = {
    padding: "10px 20px",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    color: "inherit",
};

const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 12,
};

const pinCardStyle: React.CSSProperties = {
    borderRadius: 8,
    border: "1px solid var(--border-color, #eee)",
    overflow: "hidden",
    cursor: "pointer",
    background: "var(--bg-secondary, #fff)",
};

const backBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    color: "#22c55e",
    padding: "0 0 16px",
    fontWeight: 500,
};
