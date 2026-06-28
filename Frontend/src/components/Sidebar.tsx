import { useState, useEffect, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "./styles/Sidebar.css";
import { PIN_COLOR } from "../../constants";
import TripPlanner, { TripPlanResult } from "./TripPlanner";
import QuickStatsWidget from "./QuickStatsWidget";
import NotificationBell from "./NotificationBell";

const KM_TO_MILES = 0.621371;

function deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

interface Pin {
    id?: number;
    latitude: number;
    longitude: number;
    title?: string;
    message: string;
    image: string;
    color: string;
    email?: string;
}

interface RouteSegment {
    lineName: string;
    polyline?: string;
    departureStop: string;
    arrivalStop: string;
    departureLocation?: { lat: number; lng: number };
    arrivalLocation?: { lat: number; lng: number };
}

interface RouteData {
    mode: 'transit' | 'driving';
    polyline?: string;
    segments?: RouteSegment[];
}

interface SidebarProps {
    mapRef: React.MutableRefObject<mapboxgl.Map | null>;
    allPins: Pin[];
    savedPlaces: Pin[];
    isLoggedIn: boolean;
    isSearchFocused: boolean;
    showTripPlanner: boolean;
    onOpenTripPlanner: () => void;
    onCloseTripPlanner: () => void;
    onTripPlanComplete: (result: TripPlanResult) => void;
    onWideModeChange?: (isWide: boolean) => void;
    onFlightSelected?: (originCoords: { lat: number; lng: number }, destCoords: { lat: number; lng: number }) => void;
    onHotelSelected?: (destAirportCoords: { lat: number; lng: number } | undefined, hotelCoords: { lat: number; lng: number }, routeData?: RouteData) => void;
}


interface FollowedUser {
    id: number;
    name: string;
    avatar: string | null;
}

export default function Sidebar({ mapRef, allPins, savedPlaces, isLoggedIn, isSearchFocused, showTripPlanner, onOpenTripPlanner, onCloseTripPlanner, onTripPlanComplete, onWideModeChange, onFlightSelected, onHotelSelected }: SidebarProps) {
    const [activeTab, setActiveTab] = useState<"discovery" | "saved">("discovery");
    const [mapCenter, setMapCenter] = useState<{ lng: number; lat: number }>({ lng: -122.4, lat: 37.8 });
    const [maxDistance, setMaxDistance] = useState(100);
    const [isWide, setIsWide] = useState(false);
    const [followedUsers, setFollowedUsers] = useState<FollowedUser[]>([]);

    useEffect(() => {
        if (!isLoggedIn) return;
        fetch(`${import.meta.env.VITE_API_BASE ?? ""}/api/me/feed`, { credentials: "include" })
            .then(r => r.ok ? r.json() : { items: [] })
            .then(data => {
                const seen = new Set<number>();
                const users: FollowedUser[] = [];
                for (const item of (data.items ?? [])) {
                    if (item.creatorID && !seen.has(item.creatorID)) {
                        seen.add(item.creatorID);
                        users.push({ id: item.creatorID, name: item.creatorName ?? item.creatorEmail ?? "User", avatar: null });
                        if (users.length >= 5) break;
                    }
                }
                setFollowedUsers(users);
            })
            .catch(() => {});
    }, [isLoggedIn]);

    useEffect(() => {
        if (onWideModeChange) {
            onWideModeChange(isWide);
        }
    }, [isWide, onWideModeChange]);

    // Update map center when map moves
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const handleMove = () => {
            const center = map.getCenter();
            if (center) {
                setMapCenter({ lng: center.lng, lat: center.lat });
            }
        };

        map.on("moveend", handleMove);
        // Initial center
        handleMove();

        return () => {
            map.off("moveend", handleMove);
        };
    }, [mapRef]);

    const nearbyPins = useMemo(() => {
        return allPins
            .map(pin => ({
                ...pin,
                distance: calculateDistance(mapCenter.lat, mapCenter.lng, pin.latitude, pin.longitude)
            }))
            .filter(pin => (pin.distance * KM_TO_MILES) < maxDistance)
            .sort((a, b) => a.distance - b.distance);
    }, [allPins, mapCenter, maxDistance]);


    const handlePinClick = (pin: Pin) => {
        if (mapRef.current) {
            mapRef.current.flyTo({
                center: [pin.longitude, pin.latitude],
                zoom: 14,
                essential: true,
            });
        }
    };

    const renderPinList = (pins: (Pin & { distance?: number })[]) => {
        if (pins.length === 0) {
            return (
                <div className="empty-state">
                    <span className="empty-state-icon">📍</span>
                    <p>No places found</p>
                </div>
            );
        }

        return (
            <ul className="sidebar-pin-list">
                {pins.map((pin, idx) => {
                    const titleText = pin.title?.trim() || pin.message?.trim() || "Untitled Pin";
                    const messageText = pin.message?.trim() || "";
                    const showMessage = messageText && messageText !== titleText;

                    return (
                        <li key={pin.id || idx} className="sidebar-pin-card" onClick={() => handlePinClick(pin)}>
                            <div className="sidebar-pin-card-header">
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <div
                                        className="sidebar-pin-color-dot"
                                        style={{ backgroundColor: pin.color || PIN_COLOR }}
                                    />
                                    <span className="sidebar-pin-card-title">{titleText}</span>
                                </div>
                                {pin.distance !== undefined && (pin.distance * KM_TO_MILES) < 100 && (() => {
                                    const distanceInMiles = pin.distance * KM_TO_MILES;
                                    return (
                                        <span className="sidebar-pin-card-distance">
                                            {distanceInMiles < 0.1
                                                ? `${(distanceInMiles * 5280).toFixed(0)}ft`
                                                : `${distanceInMiles.toFixed(1)}mi`}
                                        </span>
                                    );
                                })()}
                            </div>
                            {showMessage && <p className="sidebar-pin-card-message">{messageText}</p>}
                            {pin.image && <img src={pin.image} alt={titleText} className="sidebar-pin-card-image" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                        </li>
                    );
                })}
            </ul>
        );
    };

    return (
        <aside className={`sidebar-container ${isSearchFocused ? "collapsed" : ""} ${isWide ? "wide" : ""}`}>
{showTripPlanner ? (
                <TripPlanner
                    isOpen={showTripPlanner}
                    onClose={onCloseTripPlanner}
                    onPlanComplete={onTripPlanComplete}
                    onWideModeChange={setIsWide}
                    mapRef={mapRef}
                    onFlightSelected={onFlightSelected}
                    onHotelSelected={onHotelSelected}
                />
            ) : (
                <>
                    {activeTab === "discovery" && (
                        <div className="sidebar-slider-container">
                            <div className="sidebar-slider-header">
                                <span className="slider-label">Distance</span>
                                <span className="slider-value">{maxDistance} mi</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="200"
                                value={maxDistance}
                                onChange={(e) => setMaxDistance(Number(e.target.value))}
                                className="sidebar-range-input"
                                style={{
                                    background: `linear-gradient(to right, #4db688 0%, #4db688 ${maxDistance * 100 / 200}%, #e0e0e0 ${maxDistance * 100 / 200}%, #e0e0e0 100%)`
                                }}
                            />
                        </div>
                    )}

                    <div className="sidebar-content">
                        <div
                            className="sidebar-slider"
                            style={{ transform: `translateX(${activeTab === "discovery" ? "0%" : "-50%"})` }}
                        >
                            <div className="sidebar-panel">
                                {isLoggedIn && (
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 4 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                            <a href="/my-trips" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--accent, #3b82f6)", textDecoration: "none" }}>
                                                🧳 My Trips
                                            </a>
                                            <a href="/sustainability" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "#16a34a", textDecoration: "none" }}>
                                                🌱 Impact
                                            </a>
                                        </div>
                                        <NotificationBell isLoggedIn={isLoggedIn} />
                                    </div>
                                )}
                                {isLoggedIn && followedUsers.length > 0 && (
                                    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border-color, #e5e7eb)", marginBottom: 8 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary, #6b7280)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Following</span>
                                            <a href="/home" style={{ fontSize: 11, color: "var(--accent, #3b82f6)", textDecoration: "none" }}>View all →</a>
                                        </div>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                            {followedUsers.map(u => (
                                                <a key={u.id} href={`/profile/${u.id}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, textDecoration: "none", color: "inherit", fontSize: 11, maxWidth: 52 }}>
                                                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15, flexShrink: 0, overflow: "hidden" }}>
                                                        {u.avatar ? <img src={u.avatar} alt={u.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : u.name[0]?.toUpperCase()}
                                                    </div>
                                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 52, textAlign: "center" }}>{u.name.split(" ")[0]}</span>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {renderPinList(nearbyPins)}
                            </div>
                            <div className="sidebar-panel">
                                {!isLoggedIn ? (
                                    <div className="empty-state">
                                        <p>Log in to see your saved places</p>
                                    </div>
                                ) : (
                                    <>
                                        <QuickStatsWidget />
                                        {renderPinList(savedPlaces)}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <nav className="sidebar-tabs">
                        <button
                            className={`tab-button ${activeTab === "discovery" ? "active" : ""}`}
                            onClick={() => setActiveTab("discovery")}
                        >
                            <span className="tab-icon">🌍</span>
                            <span className="tab-label">Discovery</span>
                        </button>
                        <button
                            className={`tab-button ${activeTab === "saved" ? "active" : ""}`}
                            onClick={() => setActiveTab("saved")}
                        >
                            <span className="tab-icon">🔖</span>
                            <span className="tab-label">Saved</span>
                        </button>
                        <button
                            className="tab-button"
                            onClick={onOpenTripPlanner}
                        >
                            <span className="tab-icon">✈️</span>
                            <span className="tab-label">Trip</span>
                        </button>
                    </nav>
                </>
            )}
        </aside>
    );
}
