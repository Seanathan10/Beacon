import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router";
import "./styles/DetailedPinModal.css";
import { BASE_API_URL, PIN_COLOR } from '../../constants';
import { EmojiReactionPicker } from "./EmojiReactionPicker";
import ShareMenu from "./ShareMenu";
import { track } from "@/utils/analytics";

interface DetailedPinModalProps {
    selectedPoint: {
        id?: number;
        creatorID?: number;
        latitude: number;
        longitude: number;
        title?: string;
        description: string;
        image: string;
        email?: string;
        address?: string;
        tags?: string | string[];
        userStatus?: "visited" | "wishlist" | null;
    };
    currentUserId: number | null;
    currentUserEmail: string | null;
    onClose: () => void;
    onUpdate?: (data: {
        id: number;
        description: string;
        image: string;
        color?: string;
    }) => void;
    onDelete?: (id: number) => void;
    onClone?: (data: {
        title: string;
        description: string;
        image: string;
        tags: string[];
    }) => void;
    onStatusChange?: (pinId: number, status: "visited" | "wishlist" | null) => void;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB limit

interface CommentReaction {
    emoji: string;
    count: number;
    userReacted: boolean;
}

interface Comment {
    id: number;
    accountID: number;
    pinID: number;
    email: string;
    comment: string;
    createdAt: string;
    reactions?: CommentReaction[];
    isCreator?: boolean;
    hasLiked?: boolean;
}

function ModalSection({ header, content }: { header: string, content: React.ReactNode }) {
    return (
        <div className="detailed-info-section">
            <h3 style={{ marginBottom: 0 }}>{header}</h3>
            <p className="detailed-message">
                {content}
            </p>
        </div>
    )
}

function parseTags(raw: string | string[] | undefined): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return raw.split(",").map(t => t.trim()).filter(Boolean);
    }
}

export default function DetailedPinModal({ selectedPoint, currentUserId: _currentUserId, currentUserEmail, onClose, onUpdate, onDelete, onClone, onStatusChange }: DetailedPinModalProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [userStatus, setUserStatus] = useState<"visited" | "wishlist" | null>(selectedPoint.userStatus ?? null);

    useEffect(() => {
        setUserStatus(selectedPoint.userStatus ?? null);
    }, [selectedPoint.id, selectedPoint.userStatus]);

    const toggleStatus = (next: "visited" | "wishlist") => {
        if (!selectedPoint.id) return;
        const prev = userStatus;
        const newStatus = prev === next ? null : next;
        setUserStatus(newStatus);
        onStatusChange?.(selectedPoint.id, newStatus);

        const request = newStatus
            ? fetch(`${BASE_API_URL}/api/pins/${selectedPoint.id}/status`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            })
            : fetch(`${BASE_API_URL}/api/pins/${selectedPoint.id}/status`, {
                method: "DELETE",
                credentials: "include",
            });

        request.then(res => {
            if (!res.ok && res.status !== 404) {
                setUserStatus(prev);
                onStatusChange?.(selectedPoint.id!, prev);
            }
        }).catch(() => {
            setUserStatus(prev);
            onStatusChange?.(selectedPoint.id!, prev);
        });
    };
    const [description, setDescription] = useState(selectedPoint.description);
    const [image, setImage] = useState(selectedPoint.image);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleClose = useCallback(() => {
        setIsClosing(true);
        setTimeout(onClose, 300);
    }, [onClose]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                handleClose();
            }
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [handleClose]);

    // Comments state
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [showAllComments, setShowAllComments] = useState(false);
    const [isLoadingComments, setIsLoadingComments] = useState(false);
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState<number | null>(null);
    const [optimisticReactions, setOptimisticReactions] = useState<{ [key: number]: { emoji: string; count: number; userReacted: boolean }[] }>({});

    interface SimilarPin { id: number; title?: string; image?: string; }
    const [similarPins, setSimilarPins] = useState<SimilarPin[]>([]);

    useEffect(() => {
        if (!selectedPoint.id) return;
        const controller = new AbortController();
        fetch(`${BASE_API_URL}/api/pins/${selectedPoint.id}/similar`, { credentials: "include", signal: controller.signal })
            .then(r => r.ok ? r.json() : [])
            .then(data => setSimilarPins(Array.isArray(data) ? data : []))
            .catch((err) => { if (err?.name !== "AbortError") setSimilarPins([]); });
        return () => controller.abort();
    }, [selectedPoint.id]);

    const fetchComments = useCallback(async (signal?: AbortSignal) => {
        if (!selectedPoint.id) return;

        setIsLoadingComments(true);
        try {
            const response = await fetch(
                `${BASE_API_URL}/api/pins/${selectedPoint.id}/comments`,
                { credentials: "include", signal }
            );

            if (response.ok) {
                const data = await response.json();
                setComments(data);
            } else {
                console.error("Failed to fetch comments");
            }
        } catch (err) {
            if ((err as Error)?.name === "AbortError") return; // unmounted/superseded
            console.error("Error fetching comments:", err);
        } finally {
            if (!signal?.aborted) setIsLoadingComments(false);
        }
    }, [selectedPoint.id]);

    // Fetch comments when modal opens
    useEffect(() => {
        if (selectedPoint.id) {
            const controller = new AbortController();
            fetchComments(controller.signal);
            return () => controller.abort();
        }
    }, [selectedPoint.id, fetchComments]);

    const handleSubmitComment = async () => {
        if (!newComment.trim() || !selectedPoint.id) return;

        if (newComment.length > 280) {
            alert("Comment must be 280 characters or less");
            return;
        }

        setIsSubmittingComment(true);
        try {
            const response = await fetch(
                `${BASE_API_URL}/api/pins/${selectedPoint.id}/comments`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ comment: newComment.trim() }),
                }
            );

            if (response.ok) {
                const newCommentData = await response.json();
                track("Pin Comment Added");
                setComments([newCommentData, ...comments]);
                setNewComment("");
            } else {
                let errorMessage = "Failed to post comment";
                try {
                    const error = await response.json();
                    errorMessage = error.message || errorMessage;
                } catch {
                    errorMessage = `Failed to post comment (${response.status})`;
                }
                alert(errorMessage);
            }
        } catch (error) {
            console.error("Error posting comment:", error);
            alert("Failed to post comment. Please check your connection.");
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const handleDeleteComment = async (commentId: number) => {
        if (!confirm("Delete this comment?")) return;

        try {
            const response = await fetch(
                `${BASE_API_URL}/api/comments/${commentId}`,
                { method: "DELETE", credentials: "include" }
            );

            if (response.ok) {
                setComments(comments.filter(c => c.id !== commentId));
            } else {
                alert("Failed to delete comment");
            }
        } catch (error) {
            console.error("Error deleting comment:", error);
            alert("Failed to delete comment");
        }
    };

    const handleAddReaction = async (commentId: number, emoji: string) => {
        try {
            // Optimistic update
            const existingReactions = comments.find(c => c.id === commentId)?.reactions || [];
            const reactionIndex = existingReactions.findIndex(r => r.emoji === emoji);
            
            let newReactions: CommentReaction[];
            if (reactionIndex >= 0) {
                newReactions = [...existingReactions];
                if (newReactions[reactionIndex].userReacted) {
                    newReactions[reactionIndex] = {
                        ...newReactions[reactionIndex],
                        count: newReactions[reactionIndex].count - 1,
                        userReacted: false,
                    };
                } else {
                    newReactions[reactionIndex] = {
                        ...newReactions[reactionIndex],
                        count: newReactions[reactionIndex].count + 1,
                        userReacted: true,
                    };
                }
            } else {
                newReactions = [...existingReactions, { emoji, count: 1, userReacted: true }];
            }
            
            setOptimisticReactions(prev => ({
                ...prev,
                [commentId]: newReactions,
            }));

            const response = await fetch(
                `${BASE_API_URL}/api/comments/${commentId}/reactions`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ emoji }),
                }
            );

            if (response.ok) {
                // Refetch comments to get authoritative state
                const commentsResponse = await fetch(
                    `${BASE_API_URL}/api/pins/${selectedPoint.id}/comments`,
                    { credentials: "include" }
                );
                if (commentsResponse.ok) {
                    const updatedComments = await commentsResponse.json();
                    setComments(updatedComments);
                    setOptimisticReactions({});
                }
            } else {
                // Revert optimistic update on failure
                setOptimisticReactions(prev => {
                    const updated = { ...prev };
                    delete updated[commentId];
                    return updated;
                });
            }
            setShowReactionPicker(null);
        } catch (error) {
            console.error("Error adding reaction:", error);
            // Revert optimistic update
            setOptimisticReactions(prev => {
                const updated = { ...prev };
                delete updated[commentId];
                return updated;
            });
        }
    };

    const handleRemoveReaction = async (commentId: number, emoji: string) => {
        try {
            // Optimistic update
            const existingReactions = comments.find(c => c.id === commentId)?.reactions || [];
            const reactionIndex = existingReactions.findIndex(r => r.emoji === emoji);
            
            const newReactions: CommentReaction[] = [...existingReactions];
            if (reactionIndex >= 0) {
                newReactions[reactionIndex] = {
                    ...newReactions[reactionIndex],
                    count: Math.max(0, newReactions[reactionIndex].count - 1),
                    userReacted: false,
                };
            }
            
            setOptimisticReactions(prev => ({
                ...prev,
                [commentId]: newReactions,
            }));

            const response = await fetch(
                `${BASE_API_URL}/api/comments/${commentId}/reactions/${emoji}`,
                {
                    method: "DELETE",
                    credentials: "include",
                }
            );

            if (response.ok) {
                // Refetch comments
                const commentsResponse = await fetch(
                    `${BASE_API_URL}/api/pins/${selectedPoint.id}/comments`,
                    { credentials: "include" }
                );
                if (commentsResponse.ok) {
                    const updatedComments = await commentsResponse.json();
                    setComments(updatedComments);
                    setOptimisticReactions({});
                }
            } else {
                // Revert optimistic update
                setOptimisticReactions(prev => {
                    const updated = { ...prev };
                    delete updated[commentId];
                    return updated;
                });
            }
        } catch (error) {
            console.error("Error removing reaction:", error);
            // Revert optimistic update
            setOptimisticReactions(prev => {
                const updated = { ...prev };
                delete updated[commentId];
                return updated;
            });
        }
    };

    const isOwner =
        currentUserEmail != null && selectedPoint.email === currentUserEmail;

    const titleText =
        selectedPoint.title?.trim() ||
        selectedPoint.description?.trim() ||
        "Untitled Pin";
    const messageText = selectedPoint.description?.trim() || "";
    const showMessage = messageText && messageText !== titleText;

    const handleFileSelect = (file: File) => {
        setUploadError(null);
        if (!ALLOWED_TYPES.includes(file.type)) {
            setUploadError("Invalid file type");
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setUploadError("File too large");
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
        const response = await fetch(
            `/api/upload?filename=${encodeURIComponent(file.name)}`,
            {
                method: "POST",
                body: file,
            },
        );
        if (!response.ok) throw new Error("Upload failed");
        const blob = await response.json();
        return blob.url;
    };

    const handleSave = async () => {
        if (!selectedPoint.id) return;
        setIsSaving(true);

        try {
            let finalImageUrl = image;
            if (imageFile) {
                try {
                    finalImageUrl = await uploadImage(imageFile);
                } catch {
                    alert("Image upload is not available. Save your changes with a URL instead, or remove the image.");
                    setIsSaving(false);
                    return;
                }
            }

            const response = await fetch(
                `${BASE_API_URL}/api/pins/${selectedPoint.id}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        description,
                        image: finalImageUrl,
                    }),
                },
            );

            if (response.ok) {
                const updatedPin = await response.json();
                track("Pin Edited");
                onUpdate?.({
                    id: selectedPoint.id,
                    description: updatedPin.description || description,
                    image: updatedPin.image || finalImageUrl,
                    color: PIN_COLOR,
                });
                setIsEditing(false);
            } else {
                alert("Failed to save changes. Please try again.");
            }
        } catch {
            alert("Failed to save changes. Please check your connection and try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleClone = () => {
        track("Pin Cloned");
        onClone?.({
            title: selectedPoint.title?.trim() || "",
            description: selectedPoint.description?.trim() || "",
            image: selectedPoint.image || "",
            tags: parseTags(selectedPoint.tags),
        });
        handleClose();
    };

    const handleDelete = async () => {
        if (!selectedPoint.id) return;
        if (!confirm("Are you sure you want to delete this pin? This action cannot be undone.")) return;

        setIsDeleting(true);
        try {
            const response = await fetch(
                `${BASE_API_URL}/api/pins/${selectedPoint.id}`,
                { method: "DELETE", credentials: "include" }
            );

            if (response.ok) {
                track("Pin Deleted");
                onDelete?.(selectedPoint.id);
                handleClose();
            } else {
                alert("Failed to delete pin");
            }
        } catch (error) {
            console.error("Error deleting pin:", error);
            alert("Failed to delete pin");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className={`detailed-modal-overlay ${isClosing ? 'is-closing' : ''}`} onClick={handleClose}>
            <div
                className={`detailed-modal ${isClosing ? 'is-closing' : ''}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="detailed-modal-header">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <h2>{isEditing ? "Edit Pin" : selectedPoint.title}</h2>
                        <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>{selectedPoint.address}</p>
                    </div>
                    <div className="detailed-modal-header-actions">
                        {selectedPoint.id && (
                            <ShareMenu
                                url={`${window.location.origin}/home?pin=${selectedPoint.id}`}
                                title={selectedPoint.title ? `${selectedPoint.title} on Beacon` : "Check this out on Beacon!"}
                                className="detailed-modal-share"
                            />
                        )}
                        <button
                            className="detailed-modal-close"
                            onClick={handleClose}
                            aria-label="Close"
                        >
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="detailed-modal-content">
                    {!isEditing && selectedPoint.id && (
                        <div className="pin-status-bar">
                            <button
                                type="button"
                                className={`pin-status-btn ${userStatus === "visited" ? "active visited" : ""}`}
                                onClick={() => toggleStatus("visited")}
                                aria-pressed={userStatus === "visited"}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                {userStatus === "visited" ? "Visited" : "Mark as visited"}
                            </button>
                            <button
                                type="button"
                                className={`pin-status-btn ${userStatus === "wishlist" ? "active wishlist" : ""}`}
                                onClick={() => toggleStatus("wishlist")}
                                aria-pressed={userStatus === "wishlist"}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill={userStatus === "wishlist" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="12 2 15 8.5 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 9 8.5 12 2"></polygon>
                                </svg>
                                {userStatus === "wishlist" ? "On wishlist" : "Add to wishlist"}
                            </button>
                        </div>
                    )}
                    {isEditing ? (
                        <div className="edit-form">
                            {image && (
                                <div className="image-preview-container">
                                    <img
                                        src={image}
                                        alt="Preview"
                                        className="detailed-modal-image"
                                    />
                                    <button
                                        className="remove-image-btn"
                                        onClick={() => {
                                            setImage("");
                                            setImageFile(null);
                                        }}
                                    >
                                        Remove
                                    </button>
                                </div>
                            )}
                            <div className="file-input-wrapper">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={(e) =>
                                        e.target.files?.[0] &&
                                        handleFileSelect(e.target.files[0])
                                    }
                                    accept="image/*"
                                />
                            </div>
                            {uploadError && (
                                <div className="error-message">
                                    {uploadError}
                                </div>
                            )}

                            <div className="form-group">
                                <label>Description</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="edit-textarea"
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            {selectedPoint.image ? (
                                <img
                                    src={selectedPoint.image}
                                    alt="Pin location"
                                    className="detailed-modal-image"
                                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                                />
                            ) : (
                                <div
                                    className="detailed-modal-image-placeholder"
                                    style={{
                                        background: `linear-gradient(135deg, ${PIN_COLOR}88 0%, ${PIN_COLOR} 100%)`,
                                    }}
                                >
                                    {titleText.charAt(0).toUpperCase()}
                                </div>
                            )}

                            {showMessage && (
                                <ModalSection
                                    header={"Description"}
                                    content={selectedPoint.description}
                                />
                            )}

                            {selectedPoint.email && (
                                <div className="detailed-info-section">
                                    <h3 style={{ marginBottom: 0 }}>Uploaded by</h3>
                                    <p className="detailed-message">
                                        {selectedPoint.creatorID ? (
                                            <Link to={`/profile/${selectedPoint.creatorID}`} style={{ color: "var(--accent, #22c55e)", textDecoration: "none" }}>
                                                @{selectedPoint.email.split("@")[0]}
                                            </Link>
                                        ) : (
                                            `@${selectedPoint.email.split("@")[0]}`
                                        )}
                                    </p>
                                </div>
                            )}

                            {/* Address is already shown beneath the title in the header. */}

                            {/* Comments Section */}
                            <div className="detailed-info-section comments-section">
                                <h3>
                                    Comments
                                    <span className="comments-count">({comments.length})</span>
                                </h3>

                                {/* Add Comment Input */}
                                <div className="add-comment-container">
                                    <div className="comment-avatar">
                                        {currentUserEmail?.charAt(0).toUpperCase() || "?"}
                                    </div>
                                    <div className="comment-input-wrapper">
                                        <textarea
                                            className="comment-input"
                                            placeholder="Add a comment..."
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                            rows={1}
                                            maxLength={280}
                                            disabled={isSubmittingComment}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSubmitComment();
                                                }
                                            }}
                                        />
                                        <button
                                            className="comment-submit-btn"
                                            disabled={!newComment.trim() || isSubmittingComment}
                                            onClick={handleSubmitComment}
                                        >
                                            {isSubmittingComment ? (
                                                <svg
                                                    width="18"
                                                    height="18"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    className="spinning"
                                                >
                                                    <line x1="12" y1="2" x2="12" y2="6"></line>
                                                    <line x1="12" y1="18" x2="12" y2="22"></line>
                                                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                                                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                                                    <line x1="2" y1="12" x2="6" y2="12"></line>
                                                    <line x1="18" y1="12" x2="22" y2="12"></line>
                                                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                                                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                                                </svg>
                                            ) : (
                                                <svg
                                                    width="18"
                                                    height="18"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                >
                                                    <line x1="22" y1="2" x2="11" y2="13"></line>
                                                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Loading State */}
                                {isLoadingComments && (
                                    <div className="comments-loading">Loading comments...</div>
                                )}

                                {/* Empty State */}
                                {!isLoadingComments && comments.length === 0 && (
                                    <div className="comments-empty">
                                        No comments yet. Be the first to comment!
                                    </div>
                                )}

                                {/* Comments List */}
                                {!isLoadingComments && comments.length > 0 && (
                                    <div className="comments-list">
                                        {(showAllComments ? comments : comments.slice(0, 2)).map((comment) => {
                                            const reactions = optimisticReactions[comment.id] || comment.reactions || [];
                                            return (
                                                <div key={comment.id} className="comment-item">
                                                    <div className="comment-avatar">
                                                        {comment.email.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="comment-content">
                                                        <div className="comment-header">
                                                            <span className="comment-author">
                                                                {comment.email.split('@')[0]}
                                                                {comment.isCreator && <span className="badge-creator">✓ Creator</span>}
                                                                {comment.hasLiked && <span className="badge-liked">♥ Liked</span>}
                                                            </span>
                                                            <span className="comment-time">
                                                                {new Date(comment.createdAt).toLocaleDateString('en-US', {
                                                                    month: 'short',
                                                                    day: 'numeric',
                                                                })}
                                                            </span>
                                                        </div>
                                                        <p className="comment-text">{comment.comment}</p>
                                                        
                                                        {/* Reactions Display */}
                                                        {reactions.length > 0 && (
                                                            <div className="comment-reactions">
                                                                {reactions.map((reaction) => (
                                                                    <button
                                                                        key={reaction.emoji}
                                                                        className={`reaction-pill ${reaction.userReacted ? 'user-reacted' : ''}`}
                                                                        onClick={() => {
                                                                            if (reaction.userReacted) {
                                                                                handleRemoveReaction(comment.id, reaction.emoji);
                                                                            }
                                                                        }}
                                                                        title={reaction.userReacted ? 'Click to remove your reaction' : `${reaction.count} ${reaction.emoji}`}
                                                                    >
                                                                        {reaction.emoji} {reaction.count}
                                                                    </button>
                                                                ))}
                                                                <button
                                                                    className="reaction-add-btn"
                                                                    onClick={() => setShowReactionPicker(showReactionPicker === comment.id ? null : comment.id)}
                                                                >
                                                                    +
                                                                </button>
                                                                {showReactionPicker === comment.id && (
                                                                    <div className="reaction-picker-popup">
                                                                        <EmojiReactionPicker
                                                                            onEmojiSelect={(emoji) => handleAddReaction(comment.id, emoji)}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        
                                                        {reactions.length === 0 && (
                                                            <div className="comment-reactions">
                                                                <button
                                                                    className="reaction-add-btn"
                                                                    onClick={() => setShowReactionPicker(showReactionPicker === comment.id ? null : comment.id)}
                                                                >
                                                                    +
                                                                </button>
                                                                {showReactionPicker === comment.id && (
                                                                    <div className="reaction-picker-popup">
                                                                        <EmojiReactionPicker
                                                                            onEmojiSelect={(emoji) => handleAddReaction(comment.id, emoji)}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        
                                                        {currentUserEmail === comment.email && (
                                                            <div className="comment-actions">
                                                                <button
                                                                    className="comment-action-btn delete"
                                                                    onClick={() => handleDeleteComment(comment.id)}
                                                                >
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                        <polyline points="3 6 5 6 21 6"></polyline>
                                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                                    </svg>
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Show More/Less Button */}
                                {comments.length > 2 && (
                                    <button
                                        className="show-more-comments-btn"
                                        onClick={() => setShowAllComments(!showAllComments)}
                                    >
                                        {showAllComments
                                            ? "Show less"
                                            : `View all ${comments.length} comments`
                                        }
                                    </button>
                                )}
                            </div>
                        </>
                    )}

                    {similarPins.length > 0 && (
                        <div className="similar-pins-section">
                            <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text-secondary, #6b7280)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Others Also Liked</h4>
                            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                                {similarPins.map((pin) => (
                                    <div key={pin.id} style={{ flexShrink: 0, width: 100, cursor: "pointer", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-color, #e5e7eb)" }}>
                                        {pin.image ? (
                                            <img src={pin.image} alt={pin.title} style={{ width: "100%", height: 70, objectFit: "cover" }} />
                                        ) : (
                                            <div style={{ width: "100%", height: 70, background: "#f3f4f6" }} />
                                        )}
                                        <div style={{ padding: "4px 6px", fontSize: 11, color: "var(--text-primary, #374151)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {pin.title || "Untitled"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="detailed-modal-actions">
                        {isEditing ? (
                            <>
                                <button
                                    className="action-button secondary"
                                    onClick={() => setIsEditing(false)}
                                    disabled={isSaving}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="action-button primary"
                                    onClick={handleSave}
                                    disabled={isSaving}
                                >
                                    {isSaving ? "Saving..." : "Save Changes"}
                                </button>
                            </>
                        ) : (
                            <>


                                {onClone && (
                                    <button
                                        className="action-button secondary"
                                        onClick={handleClone}
                                    >
                                        Create Similar
                                    </button>
                                )}
                                {isOwner ? (
                                    <>
                                        <button
                                            className="action-button secondary"
                                            onClick={handleDelete}
                                            disabled={isDeleting}
                                            style={{ color: '#dc2626' }}
                                        >
                                            {isDeleting ? "Deleting..." : "Delete Pin"}
                                        </button>
                                        <button
                                            className="action-button primary"
                                            onClick={() => setIsEditing(true)}
                                        >
                                            Edit Pin
                                        </button>
                                    </>
                                ) : null}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
