import { useEffect, useState, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import { reverseGeocode } from "@/utils/geocoding";
import { BASE_API_URL } from "../../constants";

interface SearchBarProps {
    mapRef: React.MutableRefObject<mapboxgl.Map | null>;
    searchMarkerRef: React.MutableRefObject<mapboxgl.Marker | null>;
    // Called when a suggestion is selected: { name, lng, lat }
    onSelectPlace?: (place: {
        name?: string;
        lng: number;
        lat: number;
        address?: string;
    }) => void;
    onSelectBeaconPin?: (pin: BeaconPinResult) => void;
    onSelectBeaconPost?: (post: BeaconPostResult) => void;
    onFocusChange?: (isFocused: boolean) => void;
    isFocused?: boolean;
}

interface SearchHistoryEntry {
    id: number;
    query: string;
    createdAt: string;
}

interface MapboxSuggestion {
    mapbox_id: string;
    name?: string;
    full_address?: string;
    place_formatted?: string;
}

export interface BeaconPinResult {
    id: number;
    creatorID?: number;
    email?: string;
    title?: string;
    address?: string;
    description?: string;
    image?: string;
    latitude: number;
    longitude: number;
    tags?: string;
    likes?: number;
    userStatus?: "visited" | "wishlist" | null;
}

export interface BeaconPostResult {
    id: number;
    creatorID?: number | null;
    email?: string;
    title: string;
    location?: string;
    message?: string;
    image?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    tags?: string[];
    upvotes?: number;
}

export default function SearchBar({
    mapRef,
    searchMarkerRef,
    onSelectPlace,
    onSelectBeaconPin,
    onSelectBeaconPost,
    onFocusChange,
    isFocused,
}: SearchBarProps) {
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [isSearching, setIsSearching] = useState<boolean>(false);
    const [searchResults, setSearchResults] = useState<MapboxSuggestion[]>([]);
    const [beaconPins, setBeaconPins] = useState<BeaconPinResult[]>([]);
    const [beaconPosts, setBeaconPosts] = useState<BeaconPostResult[]>([]);
    const [history, setHistory] = useState<SearchHistoryEntry[]>([]);

    const fetchHistory = async () => {
        try {
            const res = await fetch(`${BASE_API_URL}/api/search/history`, {
                credentials: "include",
            });
            if (res.ok) {
                const data = await res.json();
                setHistory(Array.isArray(data) ? data : []);
            }
        } catch {
            // non-fatal
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    const recordHistory = async (query: string) => {
        try {
            const res = await fetch(`${BASE_API_URL}/api/search/history`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
            });
            if (res.ok) {
                const entry = await res.json();
                setHistory(prev => {
                    const filtered = prev.filter(h => h.query !== entry.query);
                    return [entry, ...filtered].slice(0, 10);
                });
            }
        } catch {
            // non-fatal
        }
    };

    const deleteHistoryEntry = async (id: number) => {
        setHistory(prev => prev.filter(h => h.id !== id));
        try {
            await fetch(`${BASE_API_URL}/api/search/history/${id}`, {
                method: "DELETE",
                credentials: "include",
            });
        } catch {
            // non-fatal
        }
    };

    // Generate a session token for the Search Box API
    const sessionToken = useMemo(() => {
        return crypto.randomUUID();
    }, []);

    // Debounced search-as-you-type using Search Box API
    useEffect(() => {
        const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
        if (!token || !mapRef.current) return;
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setBeaconPins([]);
            setBeaconPosts([]);
            return;
        }

        const controller = new AbortController();
        const timeout = setTimeout(async () => {
            setIsSearching(true);
            try {
                const map = mapRef.current;
                const proximity = map ? `${map.getCenter().lng},${map.getCenter().lat}` : "";
                const mapboxUrl = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(
                    searchQuery,
                )}&access_token=${token}&session_token=${sessionToken}${proximity ? `&proximity=${proximity}` : ""}&language=en&limit=5`;
                const beaconUrl = `${BASE_API_URL}/api/search?q=${encodeURIComponent(searchQuery)}&limit=4`;

                const [mapboxResp, beaconResp] = await Promise.all([
                    fetch(mapboxUrl, { signal: controller.signal }),
                    fetch(beaconUrl, { credentials: "include", signal: controller.signal }),
                ]);
                const mapboxData = await mapboxResp.json();
                setSearchResults(mapboxData?.suggestions ?? []);

                if (beaconResp.ok) {
                    const beaconData = await beaconResp.json();
                    setBeaconPins(Array.isArray(beaconData?.pins) ? beaconData.pins : []);
                    setBeaconPosts(Array.isArray(beaconData?.posts) ? beaconData.posts : []);
                } else {
                    setBeaconPins([]);
                    setBeaconPosts([]);
                }
            } catch (err) {
                if ((err as Error)?.name !== "AbortError") {
                    console.error("Search error:", err);
                }
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => {
            controller.abort();
            clearTimeout(timeout);
        };
    }, [searchQuery, mapRef, sessionToken]);

    const handleSelectResult = async (suggestion: MapboxSuggestion) => {
        if (!suggestion?.mapbox_id || !mapRef.current) return;

        const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
        if (!token) return;

        try {
            // Retrieve full details for the selected suggestion
            const url = `https://api.mapbox.com/search/searchbox/v1/retrieve/${suggestion.mapbox_id}?access_token=${token}&session_token=${sessionToken}`;
            const resp = await fetch(url);
            const data = await resp.json();

            const feature = data?.features?.[0];
            if (!feature?.geometry?.coordinates) return;

            const [lng, lat] = feature.geometry.coordinates as [number, number];

            const address = await reverseGeocode(lat, lng);

            if (!searchMarkerRef.current) {
                searchMarkerRef.current = new mapboxgl.Marker({
                    color: "#1a1a1a",
                });
            }
            searchMarkerRef.current.setLngLat([lng, lat]).addTo(mapRef.current);

            mapRef.current.flyTo({
                center: [lng, lat],
                zoom: 12,
                essential: true,
            });
            setSearchQuery(suggestion.name || suggestion.full_address || "");
            // Notify parent to add a Pin popup
            if (typeof onSelectPlace === "function") {
                onSelectPlace({
                    name: suggestion.name || suggestion.full_address,
                    lng,
                    lat,
                    address: address.fullAddress,
                });
            }
            setSearchResults([]);
        } catch (err) {
            console.error("Retrieve API error:", err);
        }
    };

    const handleSelectBeaconPin = (pin: BeaconPinResult) => {
        if (!mapRef.current) return;
        mapRef.current.flyTo({
            center: [pin.longitude, pin.latitude],
            zoom: 14,
            essential: true,
        });
        setSearchQuery(pin.title || pin.address || "");
        setSearchResults([]);
        setBeaconPins([]);
        setBeaconPosts([]);
        onSelectBeaconPin?.(pin);
    };

    const handleSelectBeaconPost = (post: BeaconPostResult) => {
        if (!mapRef.current || post.latitude == null || post.longitude == null) return;
        mapRef.current.flyTo({
            center: [post.longitude, post.latitude],
            zoom: 14,
            essential: true,
        });
        setSearchQuery(post.title || post.location || "");
        setSearchResults([]);
        setBeaconPins([]);
        setBeaconPosts([]);
        onSelectBeaconPost?.(post);
    };

    const handleSearchSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = searchQuery.trim();
        if (!trimmed || !mapRef.current) return;
        // Persist before any await that might redirect attention.
        void recordHistory(trimmed);
        if (searchResults[0]) {
            await handleSelectResult(searchResults[0]);
        } else if (beaconPins[0]) {
            handleSelectBeaconPin(beaconPins[0]);
        } else if (beaconPosts[0]) {
            handleSelectBeaconPost(beaconPosts[0]);
        }
    };

    const runHistoryQuery = (entry: SearchHistoryEntry) => {
        setSearchQuery(entry.query);
        // Bump this entry to the top of the server-side history too.
        void recordHistory(entry.query);
    };

    return (
        <div className="search-bar">
            <form
                onSubmit={handleSearchSubmit}
                className="search-form"
                autoComplete="off"
            >
                <input
                    type="text"
                    className="search-input"
                    placeholder="Search places..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => onFocusChange?.(true)}
                    onBlur={() => onFocusChange?.(false)}
                />
                <button
                    type="submit"
                    className="search-button"
                    aria-label="Search"
                    disabled={isSearching}
                >
                    {isSearching ? (
                        <span className="search-spinner"></span>
                    ) : (
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    )}
                </button>
            </form>

            {isFocused && (searchResults.length > 0 || beaconPins.length > 0 || beaconPosts.length > 0) && (
                <ul className="search-results">
                    {searchResults.length > 0 && (
                        <li className="search-group-header">Map locations</li>
                    )}
                    {searchResults.map((suggestion) => (
                        <li
                            key={suggestion.mapbox_id}
                            className="search-result-item"
                            onMouseDown={() => handleSelectResult(suggestion)}
                        >
                            <div className="result-primary">
                                {suggestion.name}
                            </div>
                            {suggestion.full_address && (
                                <div className="result-secondary">
                                    {suggestion.full_address}
                                </div>
                            )}
                        </li>
                    ))}

                    {(beaconPins.length > 0 || beaconPosts.length > 0) && (
                        <li className="search-group-header">Beacon places and posts</li>
                    )}
                    {beaconPins.map((pin) => (
                        <li
                            key={`pin-${pin.id}`}
                            className="search-result-item"
                            onMouseDown={() => handleSelectBeaconPin(pin)}
                        >
                            <div className="result-primary">
                                <span>{pin.title || "Untitled pin"}</span>
                                <span className="result-badge">Pin</span>
                            </div>
                            <div className="result-secondary">
                                {pin.address || pin.description || `${pin.latitude.toFixed(3)}, ${pin.longitude.toFixed(3)}`}
                            </div>
                        </li>
                    ))}
                    {beaconPosts.map((post) => {
                        const hasCoords = post.latitude != null && post.longitude != null;
                        return (
                            <li
                                key={`post-${post.id}`}
                                className={`search-result-item ${hasCoords ? "" : "search-result-item--disabled"}`}
                                onMouseDown={() => hasCoords && handleSelectBeaconPost(post)}
                            >
                                <div className="result-primary">
                                    <span>{post.title}</span>
                                    <span className="result-badge">Post</span>
                                </div>
                                <div className="result-secondary">
                                    {post.location || post.message || (hasCoords ? "Community post" : "No map location")}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {isFocused && searchResults.length === 0 && !searchQuery.trim() && history.length > 0 && (
                <ul className="search-results search-history">
                    <li className="search-history-header">Recent searches</li>
                    {history.map((entry) => (
                        <li
                            key={entry.id}
                            className="search-result-item search-history-item"
                            onMouseDown={(e) => {
                                if ((e.target as HTMLElement).closest(".search-history-remove")) return;
                                runHistoryQuery(entry);
                            }}
                        >
                            <div className="result-primary">{entry.query}</div>
                            <button
                                type="button"
                                className="search-history-remove"
                                aria-label={`Remove "${entry.query}" from history`}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    deleteHistoryEntry(entry.id);
                                }}
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
