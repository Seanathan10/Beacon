import { useState, useRef } from "react";
import { Post } from "./Post";
import "./NewPostModal.css";

interface NewPostModalProps {
    onClose: () => void;
    onSubmit: (post: Omit<Post, "id" | "upvotes" | "comments">) => void;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB limit

const CATEGORIES = ["Hot", "Trendy", "Local", "New"];

export default function NewPostModal({ onClose, onSubmit }: NewPostModalProps) {
    const [title, setTitle] = useState("");
    const [location, setLocation] = useState("");
    const [category, setCategory] = useState<string>("New");
    const [tags, setTags] = useState<string>("");
    const [message, setMessage] = useState("");
    const [image, setImage] = useState<string>("");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadError(null);
        if (!ALLOWED_TYPES.includes(file.type)) {
            setUploadError("Invalid file type. Please use JPEG, PNG, GIF, or WebP.");
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setUploadError("File too large. Maximum size is 4.5MB.");
            return;
        }
        setImageFile(file);

        const reader = new FileReader();
        reader.onload = (e) => {
            setImage(e.target?.result as string);
        };
        reader.readAsDataURL(file);
    };

    const uploadImage = async (file: File): Promise<string> => {
        // Try Vercel Blob upload first (for production)
        try {
            const response = await fetch(
                `/api/upload?filename=${encodeURIComponent(file.name)}`,
                {
                    method: "POST",
                    body: file,
                },
            );
            if (response.ok) {
                const blob = await response.json();
                return blob.url;
            }
        } catch {
            // Upload endpoint not available, fall through to use data URL
        }
        
        // Fallback: return the base64 data URL (already set in state)
        return image;
    };

    const handleSubmit = async () => {
        if (!title.trim() || !location.trim() || !message.trim()) {
            setUploadError("Please fill in all required fields.");
            return;
        }

        setIsSaving(true);
        setUploadError(null);

        try {
            let finalImageUrl = image;
            if (imageFile) {
                finalImageUrl = await uploadImage(imageFile);
            }

            const tagArray = tags
                .split(",")
                .map((t) => t.trim())
                .filter((t) => t);

            onSubmit({
                title: title.trim(),
                location: location.trim(),
                category,
                tags: tagArray.length > 0 ? tagArray : ["Community"],
                message: message.trim(),
                image: finalImageUrl || "https://placehold.co/900x600",
            });

            onClose();
        } catch (error) {
            console.error("Error creating post:", error);
            setUploadError("Failed to upload image. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="new-post-modal-overlay" onClick={onClose}>
            <div
                className="new-post-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="new-post-modal-header">
                    <h2>Create New Post</h2>
                    <button
                        className="new-post-modal-close"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <svg
                            width="24"
                            height="24"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                <div className="new-post-modal-content">
                    <form className="new-post-form">
                        {uploadError && (
                            <div className="error-message">{uploadError}</div>
                        )}

                        <div className="form-group">
                            <label htmlFor="post-title">
                                Title <span className="required">*</span>
                            </label>
                            <input
                                id="post-title"
                                type="text"
                                className="form-input"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Enter post title"
                                maxLength={100}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="post-location">
                                Location <span className="required">*</span>
                            </label>
                            <input
                                id="post-location"
                                type="text"
                                className="form-input"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="e.g., Santa Cruz, CA"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="post-category">Category</label>
                            <select
                                id="post-category"
                                className="form-select"
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                            >
                                {CATEGORIES.map((cat) => (
                                    <option key={cat} value={cat}>
                                        {cat}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="post-tags">
                                Tags{" "}
                                <span className="label-hint">
                                    (comma-separated)
                                </span>
                            </label>
                            <input
                                id="post-tags"
                                type="text"
                                className="form-input"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                placeholder="e.g., Food, Casual, Boba"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="post-message">
                                Message <span className="required">*</span>
                            </label>
                            <textarea
                                id="post-message"
                                className="form-textarea"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Share your thoughts about this place..."
                                rows={4}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="post-image">Image</label>
                            {image && (
                                <div className="image-preview-container">
                                    <img
                                        src={image}
                                        alt="Preview"
                                        className="image-preview"
                                    />
                                    <button
                                        type="button"
                                        className="remove-image-btn"
                                        onClick={() => {
                                            setImage("");
                                            setImageFile(null);
                                            if (fileInputRef.current) {
                                                fileInputRef.current.value = "";
                                            }
                                        }}
                                    >
                                        Remove
                                    </button>
                                </div>
                            )}
                            <input
                                id="post-image"
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="form-file-input"
                                onChange={handleFileSelect}
                            />
                            <p className="form-hint">
                                Max size: 4.5MB. Formats: JPEG, PNG, GIF, WebP
                            </p>
                        </div>
                    </form>
                </div>

                <div className="new-post-modal-actions">
                    <button
                        className="action-button secondary"
                        onClick={onClose}
                        disabled={isSaving}
                    >
                        Cancel
                    </button>
                    <button
                        className="action-button primary"
                        onClick={handleSubmit}
                        disabled={isSaving}
                    >
                        {isSaving ? "Creating..." : "Create Post"}
                    </button>
                </div>
            </div>
        </div>
    );
}
