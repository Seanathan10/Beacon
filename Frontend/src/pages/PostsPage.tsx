import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { PostCard, Post, mapApiPost } from "@/components/Post";
import { api, ApiError } from "@/lib/api";
import "./PostsPage.css";

export function PostsPage() {
    const navigate = useNavigate();
    const [posts, setPosts] = useState<Post[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const currentUserId = Number(localStorage.getItem("userId"));

    const fetchPosts = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.get<Record<string, unknown>[]>("/api/posts");
            setPosts(data.map(mapApiPost));
        } catch (err) {
            if (err instanceof ApiError && err.status === 401) return;
            console.error("Error fetching posts:", err);
            setError("Failed to load posts. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    const handleBackClick = () => navigate("/home");

    const removePost = async (id: number) => {
        try {
            await api.delete(`/api/posts/${id}`);
            setPosts((prev) => prev.filter((p) => p.id !== id));
        } catch (err) {
            if (err instanceof ApiError && err.status === 401) return;
            if (err instanceof ApiError && err.status === 403) {
                setError("You can only delete your own posts.");
                return;
            }
            console.error("Error deleting post:", err);
            setError("Failed to delete post. Please try again.");
        }
    };

    return (
        <div className="posts-page">
            <div className="posts-content">
                <div className="posts-header">
                    <button className="back-button" onClick={handleBackClick}>
                        <svg
                            className="back-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden="true"
                        >
                            <path
                                d="M19 12H5M5 12L12 19M5 12L12 5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                        Back to Map
                    </button>

                    <div className="posts-title">
                        <h1>Community Posts</h1>
                        <p className="posts-subtitle">
                            Discover hidden gems shared by the community
                        </p>
                    </div>

                    <div className="posts-actions">
                        <button className="add-post-button" onClick={() => navigate('/home')}>
                            + Add Pin
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="posts-error">
                        <p>{error}</p>
                        <button onClick={() => setError(null)}>Dismiss</button>
                    </div>
                )}

                {isLoading ? (
                    <div className="posts-loading">
                        <div className="posts-loading-spinner"></div>
                        <p>Loading posts...</p>
                    </div>
                ) : posts.length === 0 ? (
                    <div className="posts-empty">
                        <div className="posts-empty-icon">🫶</div>
                        <div className="posts-empty-title">No posts yet</div>
                        <div className="posts-empty-description">
                            Be the first to share a hidden gem with the
                            community.
                        </div>
                        <button
                            className="add-post-button posts-empty-cta"
                            onClick={() => navigate('/home')}
                        >
                            + Add Pin
                        </button>
                    </div>
                ) : (
                    <div className="posts-container">
                        {posts.map((post) => (
                            <div key={post.id} className="post-row">
                                <PostCard content={post} />
                                {post.creatorID != null && post.creatorID === currentUserId && (
                                    <button
                                        className="remove-post-button"
                                        onClick={() => removePost(post.id)}
                                        aria-label={`Remove ${post.title}`}
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
