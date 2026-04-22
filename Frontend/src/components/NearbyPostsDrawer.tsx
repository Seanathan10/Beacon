import React, { useState, useEffect } from 'react';
import { PostWithCoords } from '../types/comments';
import { BASE_API_URL } from '../../constants';
import './styles/NearbyPostsDrawer.css';

interface NearbyPostsDrawerProps {
  mapBounds?: { minLng: number; minLat: number; maxLng: number; maxLat: number } | null;
  onPostSelect?: (post: PostWithCoords) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function NearbyPostsDrawer({ mapBounds, onPostSelect, isOpen, onClose }: NearbyPostsDrawerProps) {
  const [posts, setPosts] = useState<PostWithCoords[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && mapBounds) {
      fetchNearbyPosts();
    }
  }, [isOpen, mapBounds]);

  const fetchNearbyPosts = async () => {
    if (!mapBounds) return;

    setIsLoading(true);
    setError(null);

    try {
      const bbox = `${mapBounds.minLng},${mapBounds.minLat},${mapBounds.maxLng},${mapBounds.maxLat}`;
      const response = await fetch(`${BASE_API_URL}/api/posts/nearby?bbox=${encodeURIComponent(bbox)}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch nearby posts');
      }

      const data = await response.json();
      setPosts(data);
    } catch (err) {
      console.error('Error fetching nearby posts:', err);
      setError('Failed to load nearby posts');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="nearby-drawer">
      <div className="drawer-header">
        <h3>Nearby Posts</h3>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      {isLoading && <div className="drawer-loading">Loading posts...</div>}
      {error && <div className="drawer-error">{error}</div>}

      <div className="drawer-content">
        {posts.length === 0 && !isLoading && (
          <div className="drawer-empty">No posts nearby</div>
        )}

        {posts.map(post => (
          <div
            key={post.id}
            className="nearby-post-item"
            onClick={() => {
              onPostSelect?.(post);
              onClose();
            }}
          >
            {post.image && (
              <img src={post.image} alt={post.title} className="post-thumbnail" />
            )}
            <div className="post-info">
              <h4>{post.title}</h4>
              <p className="post-location">{post.location}</p>
              <p className="post-message">{post.message.substring(0, 80)}...</p>
              <div className="post-meta">
                <span className="post-upvotes">👍 {post.upvotes}</span>
                {post.category && <span className="post-category">{post.category}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
