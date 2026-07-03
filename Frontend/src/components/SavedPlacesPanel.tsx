import { useEffect, useState } from "react";
import "./styles/SavedPlacesPanel.css";
import { PIN_COLOR, BASE_API_URL } from "../../constants";
import type { Bookmark, BookmarkFolder } from "../types/bookmarks";

type Tab = 'myPins' | 'bookmarked' | 'liked' | 'visited' | 'wishlist';

interface Pin {
    id: number;
    creatorID: number;
    latitude: number;
    longitude: number;
    title?: string;
    message?: string;
    description?: string;
    image?: string;
    color?: string;
    address?: string;
    email?: string;
    likes?: number;
}

interface PinStatus {
    pinID: number;
    status: 'visited' | 'wishlist';
    updatedAt?: string;
}

interface SavedPlacesPanelProps {
    mapRef: React.RefObject<mapboxgl.Map | null>;
}

function SavedPlacesPanel({ mapRef }: SavedPlacesPanelProps) {
    const [myPins, setMyPins] = useState<Pin[]>([]);
    const [bookmarked, setBookmarked] = useState<Bookmark[]>([]);
    const [liked, setLiked] = useState<Pin[]>([]);
    const [visited, setVisited] = useState<Pin[]>([]);
    const [wishlist, setWishlist] = useState<Pin[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('myPins');
    const [folders, setFolders] = useState<BookmarkFolder[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true);
                
                // Fetch all endpoints in parallel
                const [myPinsRes, bookmarkedRes, likedRes, foldersRes, pinStatusRes] = await Promise.all([
                    fetch(`${BASE_API_URL}/api/pins/user`, { credentials: "include" }),
                    fetch(`${BASE_API_URL}/api/bookmarks`, { credentials: "include" }),
                    fetch(`${BASE_API_URL}/api/likes/user`, { credentials: "include" }),
                    fetch(`${BASE_API_URL}/api/bookmarks/folders`, { credentials: "include" }),
                    fetch(`${BASE_API_URL}/api/pin-status`, { credentials: "include" })
                ]);

                if (myPinsRes.ok) {
                    const data = await myPinsRes.json();
                    setMyPins(data);
                }

                if (bookmarkedRes.ok) {
                    const data = await bookmarkedRes.json();
                    setBookmarked(data);
                }

                if (likedRes.ok) {
                    const data = await likedRes.json();
                    setLiked(data);
                }

                if (foldersRes.ok) {
                    const data = await foldersRes.json();
                    setFolders(data);
                }

                // Handle pin statuses (visited/wishlist)
                if (pinStatusRes.ok) {
                    const statuses: PinStatus[] = await pinStatusRes.json();
                    
                    // Group statuses by type
                    const visitedPinIds = statuses
                        .filter(s => s.status === 'visited')
                        .map(s => s.pinID);
                    const wishlistPinIds = statuses
                        .filter(s => s.status === 'wishlist')
                        .map(s => s.pinID);
                    
                    // Fetch details for visited/wishlist pins
                    // For now, we'll make individual requests for each pin
                    // In production, we'd want a batch endpoint
                    const visitedPins: Pin[] = [];
                    const wishlistPins: Pin[] = [];
                    
                    // Fetch visited pins
                    for (const pinId of visitedPinIds) {
                        try {
                            const res = await fetch(`${BASE_API_URL}/api/pins/${pinId}`, { credentials: "include" });
                            if (res.ok) {
                                const pin = await res.json();
                                visitedPins.push(pin);
                            }
                        } catch (error) {
                            console.error(`Failed to fetch visited pin ${pinId}`, error);
                        }
                    }
                    
                    // Fetch wishlist pins
                    for (const pinId of wishlistPinIds) {
                        try {
                            const res = await fetch(`${BASE_API_URL}/api/pins/${pinId}`, { credentials: "include" });
                            if (res.ok) {
                                const pin = await res.json();
                                wishlistPins.push(pin);
                            }
                        } catch (error) {
                            console.error(`Failed to fetch wishlist pin ${pinId}`, error);
                        }
                    }
                    
                    setVisited(visitedPins);
                    setWishlist(wishlistPins);
                }
            } catch (error) {
                console.error("Error fetching saved places:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    const totalItems = myPins.length + bookmarked.length + liked.length + visited.length + wishlist.length;

    if (!isLoading && totalItems === 0) {
        return null;
    }

    const handlePinClick = (lat: number, lng: number) => {
        if (mapRef.current) {
            mapRef.current.flyTo({
                center: [lng, lat],
                zoom: 14,
                essential: true,
            });
        }
    };

    return (
        <div className={`saved-places-panel ${isExpanded ? "expanded" : "collapsed"}`}>
            <button
                className="panel-toggle"
                onClick={() => setIsExpanded(!isExpanded)}
                title="Toggle Saved Places"
            >
                {isExpanded ? "-" : "+"}
            </button>

            {isExpanded && (
                <div className="panel-content">
                    <h3>My Collection</h3>

                    {/* Tabs */}
                    <div className="tabs">
                        <button
                            className={`tab ${activeTab === 'myPins' ? 'active' : ''}`}
                            onClick={() => setActiveTab('myPins')}
                        >
                            My Pins ({myPins.length})
                        </button>
                        <button
                            className={`tab ${activeTab === 'visited' ? 'active' : ''}`}
                            onClick={() => setActiveTab('visited')}
                        >
                            Visited ({visited.length})
                        </button>
                        <button
                            className={`tab ${activeTab === 'wishlist' ? 'active' : ''}`}
                            onClick={() => setActiveTab('wishlist')}
                        >
                            Wishlist ({wishlist.length})
                        </button>
                        <button
                            className={`tab ${activeTab === 'liked' ? 'active' : ''}`}
                            onClick={() => setActiveTab('liked')}
                        >
                            Liked ({liked.length})
                        </button>
                        <button
                            className={`tab ${activeTab === 'bookmarked' ? 'active' : ''}`}
                            onClick={() => setActiveTab('bookmarked')}
                        >
                            Bookmarked ({bookmarked.length})
                        </button>
                    </div>

                    {/* Content */}
                    {isLoading ? (
                        <p className="loading">Loading...</p>
                    ) : (
                        <>
                            {activeTab === 'myPins' && (
                                <div className="tab-content">
                                    {myPins.length === 0 ? (
                                        <p className="empty">No pins created yet</p>
                                    ) : (
                                        <PinsList pins={myPins} onPinClick={handlePinClick} />
                                    )}
                                </div>
                            )}

                            {activeTab === 'visited' && (
                                <div className="tab-content">
                                    {visited.length === 0 ? (
                                        <p className="empty">No visited places yet</p>
                                    ) : (
                                        <PinsList pins={visited} onPinClick={handlePinClick} />
                                    )}
                                </div>
                            )}

                            {activeTab === 'wishlist' && (
                                <div className="tab-content">
                                    {wishlist.length === 0 ? (
                                        <p className="empty">No wishlist items yet</p>
                                    ) : (
                                        <PinsList pins={wishlist} onPinClick={handlePinClick} />
                                    )}
                                </div>
                            )}

                            {activeTab === 'liked' && (
                                <div className="tab-content">
                                    {liked.length === 0 ? (
                                        <p className="empty">No liked pins yet</p>
                                    ) : (
                                        <PinsList pins={liked} onPinClick={handlePinClick} />
                                    )}
                                </div>
                            )}

                            {activeTab === 'bookmarked' && (
                                <div className="tab-content">
                                    {bookmarked.length === 0 ? (
                                        <p className="empty">No bookmarked pins yet</p>
                                    ) : (
                                        <BookmarksList 
                                            bookmarks={bookmarked} 
                                            folders={folders}
                                            onPinClick={handlePinClick}
                                        />
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function PinsList({ pins, onPinClick }: { pins: Pin[], onPinClick: (lat: number, lng: number) => void }) {
    return (
        <ul className="places-list">
            {pins.map((pin) => (
                <li
                    key={pin.id}
                    className="place-item"
                    onClick={() => onPinClick(pin.latitude, pin.longitude)}
                >
                    <div className="place-header">
                        <span
                            className="place-color-indicator"
                            style={{ backgroundColor: pin.color || PIN_COLOR }}
                        />
                        <span className="place-title">{pin.title || pin.message || 'Untitled'}</span>
                    </div>
                    {pin.address && (
                        <span className="place-address">📍 {pin.address}</span>
                    )}
                    {pin.image && (
                        <div className="place-image-preview">
                            <img src={pin.image} alt={pin.title || 'Pin'} />
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}

function BookmarksList({ 
    bookmarks, 
    folders,
    onPinClick 
}: { 
    bookmarks: Bookmark[], 
    folders: BookmarkFolder[],
    onPinClick: (lat: number, lng: number) => void 
}) {
    const folderMap = new Map(folders.map(f => [f.id, f]));
    const [copied, setCopied] = useState<string | null>(null);

    // Group bookmarks by folder
    const groupedByFolder: Record<string, Bookmark[]> = {};
    bookmarks.forEach(b => {
        const folderId = b.folderID || 'uncategorized';
        if (!groupedByFolder[folderId]) {
            groupedByFolder[folderId] = [];
        }
        groupedByFolder[folderId].push(b);
    });

    const copyCollectionLink = (folderId: string) => {
        if (folderId === 'uncategorized') return;
        const link = `${window.location.origin}/collection/${folderId}`;
        navigator.clipboard.writeText(link);
        setCopied(folderId);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="bookmarks-list">
            {Object.entries(groupedByFolder).map(([folderId, pins]) => {
                const folder = folderId !== 'uncategorized' ? folderMap.get(folderId) : null;
                const canShare = folder?.isPublic;

                return (
                    <div key={folderId} className="bookmark-folder">
                        <div className="folder-header">
                            <h4 className="folder-name">
                                {folderId === 'uncategorized' 
                                    ? 'Uncategorized' 
                                    : folder?.name || 'Folder'}
                            </h4>
                            {canShare && (
                                <button
                                    className="share-button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        copyCollectionLink(folderId);
                                    }}
                                    title="Copy share link"
                                >
                                    {copied === folderId ? '✓' : '🔗'}
                                </button>
                            )}
                        </div>
                        <ul className="places-list">
                            {pins.map((pin) => (
                                <li
                                    key={pin.pinID}
                                    className="place-item"
                                    onClick={() => onPinClick(pin.latitude, pin.longitude)}
                                >
                                    <div className="place-header">
                                        <span className="place-title">{pin.title || 'Untitled'}</span>
                                    </div>
                                    {pin.address && (
                                        <span className="place-address">📍 {pin.address}</span>
                                    )}
                                    {pin.image && (
                                        <div className="place-image-preview">
                                            <img src={pin.image} alt={pin.title || 'Bookmark'} />
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}
        </div>
    );
}

export default SavedPlacesPanel;

