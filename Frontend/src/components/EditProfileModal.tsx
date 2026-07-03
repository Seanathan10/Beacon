import { useState } from "react";
import * as usersApi from "@/services/users";
import { ApiError } from "@/lib/api";

interface Props {
    currentBio: string | null;
    currentAvatar: string | null;
    currentVisibility: "public" | "friends" | "private";
    onClose: () => void;
    onSaved: (updated: { bio: string | null; avatar: string | null; profileVisibility: "public" | "friends" | "private" }) => void;
}

export default function EditProfileModal({ currentBio, currentAvatar, currentVisibility, onClose, onSaved }: Props) {
    const [bio, setBio] = useState(currentBio ?? "");
    const [avatar, setAvatar] = useState(currentAvatar ?? "");
    const [visibility, setVisibility] = useState(currentVisibility);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    async function handleSave() {
        setSaving(true);
        setError(null);
        try {
            const updated = await usersApi.updateMe<{ bio: string | null; avatar: string | null; profileVisibility: "public" | "friends" | "private" }>({
                bio: bio.trim() || null,
                avatar: avatar.trim() || null,
                profileVisibility: visibility,
            });
            onSaved(updated);
        } catch (e) {
            if (e instanceof ApiError) {
                setError(e.message || "Failed to save");
            } else {
                setError("Network error");
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div style={modalStyle}>
                <h2 style={{ margin: "0 0 16px" }}>Edit Profile</h2>

                <label style={labelStyle}>
                    Bio
                    <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        maxLength={300}
                        rows={4}
                        style={inputStyle}
                        placeholder="Tell people about yourself..."
                    />
                    <span style={{ fontSize: 12, color: "#888" }}>{bio.length}/300</span>
                </label>

                <label style={labelStyle}>
                    Avatar URL
                    <input
                        type="url"
                        value={avatar}
                        onChange={(e) => setAvatar(e.target.value)}
                        style={inputStyle}
                        placeholder="https://example.com/avatar.jpg"
                    />
                </label>

                <label style={labelStyle}>
                    Profile Visibility
                    <select
                        value={visibility}
                        onChange={(e) => setVisibility(e.target.value as "public" | "friends" | "private")}
                        style={inputStyle}
                    >
                        <option value="public">Public — anyone can see</option>
                        <option value="friends">Friends — followers only</option>
                        <option value="private">Private — only me</option>
                    </select>
                </label>

                {error && <p style={{ color: "red", fontSize: 14 }}>{error}</p>}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                    <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={saveBtnStyle}>
                        {saving ? "Saving..." : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}

const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
    background: "var(--bg-primary, #fff)",
    borderRadius: 12,
    padding: 24,
    width: "100%",
    maxWidth: 440,
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
};

const labelStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 16,
    fontSize: 14,
    fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid var(--border-color, #ddd)",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    background: "var(--bg-secondary, #f9f9f9)",
    color: "inherit",
};

const cancelBtnStyle: React.CSSProperties = {
    padding: "8px 16px",
    borderRadius: 6,
    border: "1px solid var(--border-color, #ddd)",
    background: "none",
    cursor: "pointer",
    fontSize: 14,
    color: "inherit",
};

const saveBtnStyle: React.CSSProperties = {
    padding: "8px 20px",
    borderRadius: 6,
    border: "none",
    background: "#22c55e",
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
};
