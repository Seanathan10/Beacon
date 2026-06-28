import { useRef, useState, useEffect, useCallback } from "react";
import "./Home.css";
import AuthModal from "@/components/AuthModal";
import SearchBar, { BeaconPinResult, BeaconPostResult } from "@/components/SearchBar";
import Sidebar from "@/components/Sidebar";
import SavedPlacesPanel from "@/components/SavedPlacesPanel";
import { NearbyPostsDrawer } from "@/components/NearbyPostsDrawer";
import Map, {
    GeolocateControl,
    NavigationControl,
} from "react-map-gl/mapbox";
import { Source, Layer, HeatmapLayerSpecification } from "react-map-gl/mapbox";
import Pin from "@/components/Pin";
import { reverseGeocode } from "@/utils/geocoding";
import LocationPin from "@/components/LocationPin";
import DetailedPinModal from "@/components/DetailedPinModal";
import { useSearchParams } from "react-router";
import AuthHook from "./AuthHook";
import {
    BASE_API_URL,
    PIN_COLOR,
    USER_PIN_COLOR,
    PIN_LAYER_STYLE,
    HEATMAP_LAYER_STYLE,
    CLUSTER_LAYER_STYLE,
    CLUSTER_COUNT_LAYER_STYLE,
} from '../../constants';
import { GeoJSON } from '../types/express/index';
import { Avatar } from "@/components/Avatar";
import polyline from '@mapbox/polyline';
import { getMapBoxStyleUrl, resolveTheme, onThemeChange } from "@/utils/theme";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import ShortcutsHelpModal from "@/components/ShortcutsHelpModal";
import FilterPanel, { PinFilters, loadSavedFilters } from "@/components/FilterPanel";
import { track } from "@/utils/analytics";
import ThemeToggle from "@/components/ThemeToggle";

interface PinData {
    lat: number;
    lng: number;
    isLoading: boolean;
    address: string;
    email: string;
}

export interface SelectedPoint {
    id?: number;
    creatorID?: number;
    longitude: number;
    latitude: number;
    title?: string;
    address?: string;
    description: string;
    image: string;
    color: string;
    email?: string;
    tags?: string;
    userStatus?: "visited" | "wishlist" | null;
}

interface CloneValues {
    title: string;
    message: string;
    image: string;
    tags: string[];
}

interface SavedPin {
    id: number;
    latitude: number;
    longitude: number;
    title: string;
    description: string;
    image: string;
    color: string;
    email: string;
}

interface PinApiResponse {
    id: number;
    creatorID?: number;
    email: string;
    title: string;
    description: string;
    image: string;
    address?: string;
    longitude: number;
    latitude: number;
    likes: number;
    tags: string;
    userStatus: "visited" | "wishlist" | null;
}

type MapLayerMode = "pins" | "heatmap";
type ClusterSource = {
    getClusterExpansionZoom: (
        clusterId: number,
        callback?: (err: Error | null, zoom: number) => void,
    ) => Promise<number> | void;
};

function getClusterExpansionZoom(source: ClusterSource, clusterId: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const maybePromise = source.getClusterExpansionZoom(clusterId, (err: Error | null, zoom: number) => {
            if (err) reject(err);
            else resolve(zoom);
        });
        if (maybePromise && typeof maybePromise.then === "function") {
            maybePromise.then(resolve, reject);
        }
    });
}

function HomePage() {
    useEffect(() => {
        const heartbeat = async () => {
            try {
                const res = await fetch(`${BASE_API_URL}/heartbeat`);

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                await res.text();
            } catch {
                // tunnel unreachable on initial load — non-fatal
            }
        };

        heartbeat();
    }, []);

    const mapRef = useRef<mapboxgl.Map | null>(null);
    const searchMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const [pinData, setPinData] = useState<PinData | null>(null);
    const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(
        null,
    );
    const [showDetailedModal, setShowDetailedModal] = useState<boolean>(false);
    const [allPins, setAllPins] = useState<GeoJSON>({
        type: "FeatureCollection",
        features: [],
    });
    const [savedPlaces, setSavedPlaces] = useState<SavedPin[]>([]);

    const [cursor, setCursor] = useState<string>("auto");
    const [userEmail, userId, isLoggedIn, logout, authSuccess] = AuthHook();
    const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
    const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
    const [showTripPlanner, setShowTripPlanner] = useState<boolean>(false);
    const [tripRoute, setTripRoute] = useState<GeoJSON.FeatureCollection | null>(null);
    const [flightLine, setFlightLine] = useState<GeoJSON.FeatureCollection | null>(null);
    const [hotelLine, setHotelLine] = useState<GeoJSON.FeatureCollection | null>(null);
    const [transferPoints, setTransferPoints] = useState<GeoJSON.FeatureCollection | null>(null);
    // Initialize from the user's resolved theme (saved choice, or OS when "system"),
    // not the raw OS theme — otherwise a saved dark theme renders over a light map.
    const [mapStyle, setMapStyle] = useState<string>(getMapBoxStyleUrl(resolveTheme()));
    const [showShortcutsHelp, setShowShortcutsHelp] = useState<boolean>(false);
    const [cloneValues, setCloneValues] = useState<CloneValues | null>(null);
    const [pinSort, setPinSort] = useState<"recent" | "trending" | "distance">("recent");
    const [pinFilters, setPinFilters] = useState<PinFilters>(loadSavedFilters);
    const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [geoError, setGeoError] = useState<string | null>(null);
    const [mapBounds, setMapBounds] = useState<{ minLng: number; minLat: number; maxLng: number; maxLat: number } | null>(null);
    const [mapLayerMode, setMapLayerMode] = useState<MapLayerMode>("pins");
    const [isAreaSearchActive, setIsAreaSearchActive] = useState(false);
    const [isAreaSearching, setIsAreaSearching] = useState(false);
    const [areaSearchError, setAreaSearchError] = useState<string | null>(null);

    const toPinGeoJSON = useCallback((data: PinApiResponse[]) => ({
        type: "FeatureCollection",
        features: data.map((p) => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [p.longitude, p.latitude],
            },
            properties: {
                id: p.id,
                creatorID: p.creatorID,
                email: p.email,
                title: p.title,
                description: p.description,
                image: p.image,
                color: localStorage.getItem("userEmail") === p.email ? USER_PIN_COLOR : PIN_COLOR,
                address: p.address,
                likes: p.likes || 0,
                tags: p.tags,
                userStatus: p.userStatus || null,
            },
        })),
    }), []);

    // Listen for theme changes and update map style
    useEffect(() => {
        const unsubscribe = onThemeChange((theme) => {
            setMapStyle(getMapBoxStyleUrl(theme));
        });
        return unsubscribe;
    }, []);

    const onMouseEnter = useCallback(() => setCursor("pointer"), []);
    const onMouseLeave = useCallback(() => setCursor("auto"), []);

    useKeyboardShortcuts({
        enabled: isLoggedIn && !showShortcutsHelp,
        onSearch: () => {
            const input = document.querySelector<HTMLInputElement>(".search-input");
            input?.focus();
            input?.select();
        },
        onCreate: async () => {
            if (!mapRef.current) return;
            const center = mapRef.current.getCenter();
            let geocode = { fullAddress: "Unknown Location" };
            try {
                geocode = await reverseGeocode(center.lat, center.lng);
            } catch {
                // non-fatal
            }
            setSelectedPoint(null);
            setPinData({
                lat: center.lat,
                lng: center.lng,
                isLoading: false,
                address: geocode.fullAddress || "Unknown Location",
                email: userEmail || "",
            });
        },
        onHelp: () => setShowShortcutsHelp(true),
    });

    const [searchParams, setSearchParams] = useSearchParams();

    const handleLogout = useCallback(() => {
        track("Logout");
        logout();
        setIsDropdownOpen(false);
    }, [logout]);

    // Handle ?pin= URL parameter for shared links
    useEffect(() => {
        const pinId = searchParams.get('pin');
        if (pinId && allPins.features.length > 0) {
            const feature = allPins.features.find(f => f.properties.id === parseInt(pinId));
            if (feature) {
                const coords = feature.geometry.coordinates;
                // Fly to the pin location
                mapRef.current?.flyTo({
                    center: [coords[0], coords[1]],
                    zoom: 14,
                    duration: 1500
                });
                // Set selected point and show modal
                reverseGeocode(coords[1], coords[0]).then(result => {
                    setSelectedPoint({
                        id: feature.properties.id,
                        longitude: coords[0],
                        latitude: coords[1],
                        title: feature.properties.title || "",
                        description: feature.properties.description || "",
                        image: feature.properties.image || "",
                        color: feature.properties.color || PIN_COLOR,
                        email: feature.properties.email || "",
                        address: result.fullAddress,
                    });
                    setShowDetailedModal(true);
                }).catch(() => {
                    setSelectedPoint({
                        id: feature.properties.id,
                        longitude: coords[0],
                        latitude: coords[1],
                        title: feature.properties.title || "",
                        description: feature.properties.description || "",
                        image: feature.properties.image || "",
                        color: feature.properties.color || PIN_COLOR,
                        email: feature.properties.email || "",
                        address: "",
                    });
                    setShowDetailedModal(true);
                });
                // Clear the URL parameter
                setSearchParams({});
            }
        }
    }, [allPins.features, searchParams, setSearchParams]);

    useEffect(() => {
        const controller = new AbortController();
        const fetchPins = async () => {
            try {
                let url: string;
                if (pinSort === "trending") {
                    url = `${BASE_API_URL}/api/pins/trending?days=7`;
                } else {
                    const params = new URLSearchParams();
                    if (pinSort === "distance" && geoCoords) {
                        params.set("sort", "distance");
                        params.set("lat", String(geoCoords.lat));
                        params.set("lng", String(geoCoords.lng));
                    }
                    pinFilters.tags.forEach(t => params.append("tags", t));
                    if (pinFilters.minDate) params.set("minDate", pinFilters.minDate);
                    if (pinFilters.maxDate) params.set("maxDate", pinFilters.maxDate);
                    if (pinFilters.minRating !== null) params.set("minRating", String(pinFilters.minRating));
                    if (pinFilters.maxRating !== null) params.set("maxRating", String(pinFilters.maxRating));
                    if (pinFilters.bookmarkStatus) params.set("bookmarkStatus", pinFilters.bookmarkStatus);
                    const qs = params.toString();
                    url = `${BASE_API_URL}/api/pins${qs ? `?${qs}` : ""}`;
                }
                const res = await fetch(url, {
                    credentials: "include",
                    signal: controller.signal,
                });

                if (res.status === 401) {
                    handleLogout();
                    return;
                }

                if (!res.ok) {
                    console.error("Failed to fetch pins:", res.status);
                    return;
                }

                const data = await res.json() as PinApiResponse[];
                const geojson = toPinGeoJSON(data);
                setAllPins(geojson);

                if (isLoggedIn) {
                    const savedPinsData = (() => { try { return JSON.parse(localStorage.getItem("savedPins") || '{}'); } catch { return {}; } })();
                    const email = localStorage.getItem("userEmail");
                    const savedPinIDs = (email && savedPinsData[email]) || [];
                    const saved = geojson.features
                        .filter((f) => savedPinIDs.includes(f.properties.id))
                        .map((f) => ({
                            id: f.properties.id,
                            latitude: f.geometry.coordinates[1],
                            longitude: f.geometry.coordinates[0],
                            title: f.properties.title,
                            description: f.properties.description,
                            image: f.properties.image,
                            color: f.properties.color,
                            email: f.properties.email
                        }));
                    setSavedPlaces(saved);
                }
            } catch (error) {
                if ((error as Error)?.name === "AbortError") return; // superseded by a newer fetch
                console.error("Error fetching pins:", error);
            }
        };

        if (pinSort !== "distance" || geoCoords) {
            fetchPins();
        }
        return () => controller.abort();
    }, [isLoggedIn, pinSort, geoCoords, pinFilters, handleLogout, toPinGeoJSON]);

    const requestGeo = useCallback(() => {
        if (!navigator.geolocation) {
            setGeoError("Geolocation is not supported by your browser.");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setGeoCoords({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                });
                setGeoError(null);
            },
            () => {
                setGeoError("Unable to retrieve your location.");
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
        );
    }, []);

    const handleSortChange = (next: "recent" | "trending" | "distance") => {
        track("Pin Sort Changed", { sort: next });
        setIsAreaSearchActive(false);
        setAreaSearchError(null);
        setPinSort(next);
        if (next === "distance" && !geoCoords) {
            requestGeo();
        }
    };

    const handleSearchThisArea = useCallback(async () => {
        if (!mapRef.current) return;
        const center = mapRef.current.getCenter();
        setIsAreaSearching(true);
        setAreaSearchError(null);
        try {
            const res = await fetch(`${BASE_API_URL}/api/pins/nearby`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    latitude: center.lat,
                    longitude: center.lng,
                }),
            });

            if (res.status === 401) {
                handleLogout();
                return;
            }
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json() as PinApiResponse[];
            setAllPins(toPinGeoJSON(data));
            setIsAreaSearchActive(true);
            track("Search This Area", { count: data.length });
        } catch (error) {
            console.error("Search this area failed:", error);
            setAreaSearchError("Unable to search this area.");
        } finally {
            setIsAreaSearching(false);
        }
    }, [handleLogout, toPinGeoJSON]);

    const handleMapClick = async (e: mapboxgl.MapMouseEvent) => {
        // Check if we clicked on a point feature
        const features = mapLayerMode === "pins"
            ? e.target.queryRenderedFeatures(e.point, { layers: ["clusters", "point"] })
            : e.target.queryRenderedFeatures(e.point, { layers: ["point"] });

        if (features && features.length > 0 && features[0].layer.id === "clusters") {
            const clusterId = features[0].properties?.cluster_id;
            const coordinates = (features[0].geometry as { coordinates: [number, number] }).coordinates;
            if (typeof clusterId === "number") {
                const source = e.target.getSource("my-data") as unknown as ClusterSource | undefined;
                if (!source) return;
                try {
                    const zoom = await getClusterExpansionZoom(source, clusterId);
                    e.target.easeTo({
                        center: coordinates,
                        zoom,
                    });
                } catch (error) {
                    console.error("Failed to expand cluster:", error);
                }
            }
            return;
        }

        const { lat, lng } = e.lngLat;
        let geocodeResult = { fullAddress: "Unknown Location" };
        try {
            geocodeResult = await reverseGeocode(lat, lng);
        } catch {
            // geocoding failure is non-fatal; fallback to "Unknown Location"
        }

        if (features && features.length > 0) {
            const feature = features[0];
            const coords = (feature.geometry as { coordinates: [number, number] }).coordinates;
            setSelectedPoint({
                id: feature.properties?.id,
                creatorID: feature.properties?.creatorID,
                longitude: coords[0],
                latitude: coords[1],
                title: feature.properties?.title || "",
                description: feature.properties?.description || "No description provided.",
                image: feature.properties?.image || "",
                color: feature.properties?.color || PIN_COLOR,
                email: feature.properties?.email || "",
                address: geocodeResult.fullAddress,
                tags: feature.properties?.tags,
                userStatus: feature.properties?.userStatus || null,
            });

            setPinData(null); // Close any existing pin
            return;
        }

        setSelectedPoint(null);
        setPinData({
            lat,
            lng,
            isLoading: false,
            address: geocodeResult.fullAddress || "Unknown Location",
            email: userEmail || "",
        });
    };

    // Track map bounds for nearby posts discovery
    useEffect(() => {
        if (!mapRef.current) return;

        const handleMoveEnd = () => {
            const bounds = mapRef.current!.getBounds();
            setMapBounds({
                minLng: bounds.getWest(),
                minLat: bounds.getSouth(),
                maxLng: bounds.getEast(),
                maxLat: bounds.getNorth(),
            });
        };

        mapRef.current.on("moveend", handleMoveEnd);
        // Initial bounds
        handleMoveEnd();

        return () => {
            mapRef.current?.off("moveend", handleMoveEnd);
        };
    }, []);

    return (
        <div className="home-container">
            <Sidebar
                mapRef={mapRef}
                allPins={allPins.features.map(f => ({
                    id: f.properties.id,
                    latitude: f.geometry.coordinates[1],
                    longitude: f.geometry.coordinates[0],
                    title: f.properties.title,
                    message: f.properties.description,
                    image: f.properties.image,
                    color: f.properties.color,
                    email: f.properties.email
                }))}
                savedPlaces={savedPlaces.map((p) => ({
                    id: p.id,
                    latitude: p.latitude,
                    longitude: p.longitude,
                    title: p.title,
                    message: p.description,
                    image: p.image,
                    color: p.color || PIN_COLOR
                }))}
                isLoggedIn={isLoggedIn}
                isSearchFocused={isSearchFocused}
                showTripPlanner={showTripPlanner}
                onOpenTripPlanner={() => { track("Trip Planner Opened"); setShowTripPlanner(true); }}
                onCloseTripPlanner={() => {
                    setShowTripPlanner(false);
                    setFlightLine(null);
                    setHotelLine(null);
                    setTransferPoints(null);
                }}
                onTripPlanComplete={(result) => {
                    // Clear selection lines when itinerary is generated
                    setFlightLine(null);
                    setHotelLine(null);
                    setTransferPoints(null);
                    // Decode polylines and create route GeoJSON
                    if (result.routePolylines.length > 0) {
                        const features = result.routePolylines.map((route) => {
                            const decoded = polyline.decode(route.polyline);
                            return {
                                type: "Feature" as const,
                                properties: { mode: route.mode },
                                geometry: {
                                    type: "LineString" as const,
                                    coordinates: decoded.map(([lat, lng]: [number, number]) => [lng, lat]),
                                },
                            };
                        });
                        setTripRoute({
                            type: "FeatureCollection",
                            features,
                        } as GeoJSON.FeatureCollection);
                    }
                }}
                onFlightSelected={(originCoords, destCoords) => {
                    // Calculate the shortest path - adjust for antimeridian crossing
                    let destLng = destCoords.lng;
                    const lngDiff = destCoords.lng - originCoords.lng;

                    // If the longitude difference is greater than 180°,
                    // adjust destination to go the "short way" around
                    if (lngDiff > 180) {
                        destLng = destCoords.lng - 360;
                    } else if (lngDiff < -180) {
                        destLng = destCoords.lng + 360;
                    }

                    // Draw a line between origin and destination airports
                    setFlightLine({
                        type: "FeatureCollection",
                        features: [{
                            type: "Feature",
                            properties: { type: "flight" },
                            geometry: {
                                type: "LineString",
                                coordinates: [
                                    [originCoords.lng, originCoords.lat],
                                    [destLng, destCoords.lat],
                                ],
                            },
                        }],
                    } as GeoJSON.FeatureCollection);
                    // Clear hotel line when flight changes
                    setHotelLine(null);
                    setTransferPoints(null);
                }}
                onHotelSelected={(destAirportCoords, hotelCoords, routeData) => {
                    // ROYGBIV colors for transit segments
                    const roygbivColors = [
                        "#ff0000", // Red
                        "#ff7f00", // Orange
                        "#ffff00", // Yellow
                        "#00ff00", // Green
                        "#0000ff", // Blue
                        "#4b0082", // Indigo
                        "#9400d3", // Violet
                    ];

                    // Check if we have transit route with segments
                    if (routeData?.mode === 'transit' && routeData.segments && routeData.segments.length > 0) {
                        // Create features for each segment with different colors
                        const segmentFeatures: GeoJSON.Feature[] = [];
                        const transferPointFeatures: GeoJSON.Feature[] = [];

                        routeData.segments.forEach((segment, idx) => {
                            if (segment.polyline) {
                                const decoded = polyline.decode(segment.polyline);
                                const colorIdx = idx % roygbivColors.length;

                                segmentFeatures.push({
                                    type: "Feature",
                                    properties: {
                                        type: "transit-segment",
                                        color: roygbivColors[colorIdx],
                                        lineName: segment.lineName,
                                    },
                                    geometry: {
                                        type: "LineString",
                                        coordinates: decoded.map(([lat, lng]: [number, number]) => [lng, lat]),
                                    },
                                } as GeoJSON.Feature);

                                // Add transfer point (white dot) at the end of each segment except the last
                                if (idx < routeData.segments!.length - 1 && segment.arrivalLocation) {
                                    transferPointFeatures.push({
                                        type: "Feature",
                                        properties: {
                                            type: "transfer-point",
                                            stopName: segment.arrivalStop,
                                        },
                                        geometry: {
                                            type: "Point",
                                            coordinates: [segment.arrivalLocation.lng, segment.arrivalLocation.lat],
                                        },
                                    } as GeoJSON.Feature);
                                }
                            }
                        });

                        if (segmentFeatures.length > 0) {
                            setHotelLine({
                                type: "FeatureCollection",
                                features: segmentFeatures,
                            });

                            if (transferPointFeatures.length > 0) {
                                setTransferPoints({
                                    type: "FeatureCollection",
                                    features: transferPointFeatures,
                                });
                            } else {
                                setTransferPoints(null);
                            }
                            return;
                        }
                    }

                    // Fallback to single polyline (driving or no segments)
                    if (routeData?.polyline) {
                        const decoded = polyline.decode(routeData.polyline);
                        setHotelLine({
                            type: "FeatureCollection",
                            features: [{
                                type: "Feature",
                                properties: { type: "hotel-route" },
                                geometry: {
                                    type: "LineString",
                                    coordinates: decoded.map(([lat, lng]: [number, number]) => [lng, lat]),
                                },
                            }],
                        } as GeoJSON.FeatureCollection);
                        setTransferPoints(null);
                    } else if (destAirportCoords) {
                        // Fallback to straight line
                        setHotelLine({
                            type: "FeatureCollection",
                            features: [{
                                type: "Feature",
                                properties: { type: "hotel" },
                                geometry: {
                                    type: "LineString",
                                    coordinates: [
                                        [destAirportCoords.lng, destAirportCoords.lat],
                                        [hotelCoords.lng, hotelCoords.lat],
                                    ],
                                },
                            }],
                        } as GeoJSON.FeatureCollection);
                        setTransferPoints(null);
                    }
                }}
            />
            <div className="main-content">
                <div className="search-container">
                    <SearchBar
                        mapRef={mapRef}
                        searchMarkerRef={searchMarkerRef}
                        onSelectPlace={(place) =>
                            setPinData({
                                lat: place.lat,
                                lng: place.lng,
                                address: place.address,
                                isLoading: false,
                                email: userEmail || "",
                            })
                        }
                        onFocusChange={(focused) => setIsSearchFocused(focused)}
                        isFocused={isSearchFocused}
                        onSelectBeaconPin={(pin: BeaconPinResult) => {
                            setPinData(null);
                            setSelectedPoint({
                                id: pin.id,
                                creatorID: pin.creatorID,
                                longitude: pin.longitude,
                                latitude: pin.latitude,
                                title: pin.title || "",
                                description: pin.description || "No description provided.",
                                image: pin.image || "",
                                color: localStorage.getItem("userEmail") === pin.email ? USER_PIN_COLOR : PIN_COLOR,
                                email: pin.email || "",
                                address: pin.address || "",
                                tags: pin.tags,
                                userStatus: pin.userStatus || null,
                            });
                            setShowDetailedModal(true);
                        }}
                        onSelectBeaconPost={(post: BeaconPostResult) => {
                            if (post.latitude == null || post.longitude == null) return;
                            setPinData(null);
                            setSelectedPoint({
                                id: post.id,
                                creatorID: post.creatorID ?? undefined,
                                longitude: post.longitude,
                                latitude: post.latitude,
                                title: post.title,
                                description: post.message || "",
                                image: post.image || "",
                                color: PIN_COLOR,
                                email: post.email || "",
                                address: post.location || "Unknown Location",
                                tags: Array.isArray(post.tags) ? post.tags.join(",") : undefined,
                                userStatus: null,
                            });
                            setShowDetailedModal(true);
                        }}
                    />

                    <div className="pin-sort-control" role="group" aria-label="Sort pins">
                        <button
                            type="button"
                            className={`pin-sort-option ${pinSort === "recent" ? "active" : ""}`}
                            onClick={() => handleSortChange("recent")}
                        >
                            Recent
                        </button>
                        <button
                            type="button"
                            className={`pin-sort-option ${pinSort === "trending" ? "active" : ""}`}
                            onClick={() => handleSortChange("trending")}
                        >
                            Trending
                        </button>
                        <button
                            type="button"
                            className={`pin-sort-option ${pinSort === "distance" ? "active" : ""}`}
                            onClick={() => handleSortChange("distance")}
                            title={geoError || undefined}
                        >
                            Near Me
                        </button>
                    </div>

                    <FilterPanel
                        isLoggedIn={isLoggedIn}
                        onApply={(filters) => {
                            setIsAreaSearchActive(false);
                            setAreaSearchError(null);
                            setPinFilters(filters);
                        }}
                    />

                    <div className="map-layer-control" role="group" aria-label="Map layer">
                        <button
                            type="button"
                            className={`map-layer-option ${mapLayerMode === "pins" ? "active" : ""}`}
                            onClick={() => setMapLayerMode("pins")}
                        >
                            Pins
                        </button>
                        <button
                            type="button"
                            className={`map-layer-option ${mapLayerMode === "heatmap" ? "active" : ""}`}
                            onClick={() => setMapLayerMode("heatmap")}
                        >
                            Heatmap
                        </button>
                    </div>

                    <button
                        type="button"
                        className={`search-area-button ${isAreaSearchActive ? "active" : ""}`}
                        onClick={handleSearchThisArea}
                        disabled={isAreaSearching}
                        title={areaSearchError || "Search pins near the current map center"}
                    >
                        {isAreaSearching ? "Searching..." : isAreaSearchActive ? "Area results" : "Search this area"}
                    </button>
                </div>

                <AuthModal isOpen={!isLoggedIn} onAuthSuccess={authSuccess} />


                {isLoggedIn && (
                    <div className="user-menu">
                        <button
                            className="user-menu-toggle"
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        >
                            <span className="user-email">
                                <Avatar letter={userEmail[0]} />
                            </span>
                            <svg
                                className={`chevron ${isDropdownOpen ? "open" : ""}`}
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        {isDropdownOpen && (
                            <div className="user-dropdown">
                                <div className="dropdown-item theme-toggle-row">
                                    <span>Theme</span>
                                    <ThemeToggle />
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="dropdown-item logout"
                                >
                                    Log Out
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <Map
                    ref={(map) => {
                        if (map) mapRef.current = map.getMap();
                    }}
                    mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
                    initialViewState={{
                        longitude: -122.4,
                        latitude: 37.8,
                        zoom: 9,
                    }}
                    mapStyle={mapStyle}
                    onClick={handleMapClick}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    interactiveLayerIds={mapLayerMode === "pins" ? ["clusters", "point"] : ["point"]}
                    cursor={cursor}
                    interactive={true}
                    doubleClickZoom={true}
                    dragRotate={true}
                    touchZoomRotate={true}
                    attributionControl={false}
                    transformRequest={(url) => {
                        if (url.includes('events.mapbox.com')) {
                            return undefined;
                        }
                        return { url };
                    }}
                    onZoom={(e) => {
                        const zoom = e.viewState.zoom;
                        if (zoom < 8) {
                            setPinData(null);
                            setSelectedPoint(null);
                        }
                    }}
                >
                    <GeolocateControl
                        position="bottom-right"
                        trackUserLocation
                        showUserHeading
                        showAccuracyCircle
                        showButton
                    />
                    <NavigationControl
                        position="bottom-right"
                        showCompass={true}
                        showZoom={true}
                        visualizePitch={true}
                    />

                    {pinData && (
                        <Pin
                            address={pinData.address}
                            latitude={pinData.lat}
                            longitude={pinData.lng}
                            isLoading={pinData.isLoading}
                            initialValues={cloneValues ? {
                                title: cloneValues.title,
                                message: cloneValues.message,
                                tags: cloneValues.tags,
                                image: cloneValues.image,
                            } : undefined}
                            autoOpenModal={Boolean(cloneValues)}
                            onClose={() => {
                                setPinData(null);
                                setCloneValues(null);
                            }}
                            onDetails={() => { }}
                            onPinCreated={(data) => {
                                setAllPins((prev) => ({
                                    ...prev,
                                    features: [
                                        ...prev.features,
                                        {
                                            type: "Feature",
                                            geometry: {
                                                type: "Point",
                                                coordinates: [
                                                    pinData.lng,
                                                    pinData.lat,
                                                ],
                                            },
                                            properties: {
                                                title: data.title,
                                                location: typeof pinData.address === "object" ? pinData.address?.name : pinData.address,
                                                description: data.description,
                                                image: data.image || "",
                                                color: localStorage.getItem("userEmail") === pinData.email ? USER_PIN_COLOR : PIN_COLOR,
                                                email: userEmail,
                                            },
                                        },
                                    ],
                                }));
                                setPinData(null);
                                setCloneValues(null);
                            }}
                        />
                    )}

                    {selectedPoint && (
                        <LocationPin
                            selectedPoint={selectedPoint}
                            setSelectedPoint={setSelectedPoint}
                            onShowDetails={() => setShowDetailedModal(true)}
                            onStatusChange={(pinId, status) => {
                                setAllPins((prev) => ({
                                    type: "FeatureCollection",
                                    features: prev.features.map((f) =>
                                        f.properties.id === pinId
                                            ? { ...f, properties: { ...f.properties, userStatus: status } }
                                            : f,
                                    ),
                                }));
                                setSelectedPoint((prev) => prev ? { ...prev, userStatus: status } : prev);
                            }}
                            onBookmarkChange={(_pinId, _isBookmarked) => {
                                const savedPins = (() => { try { return JSON.parse(localStorage.getItem("savedPins") || '{}'); } catch { return {}; } })();
                                const email = localStorage.getItem("userEmail")!;
                                const savedPinIDs = savedPins[email] || [];

                                const saved = allPins.features
                                    .filter(f => savedPinIDs.includes(f.properties.id))
                                    .map(f => ({
                                        id: f.properties.id,
                                        latitude: f.geometry.coordinates[1],
                                        longitude: f.geometry.coordinates[0],
                                        title: f.properties.title,
                                        description: f.properties.description,
                                        image: f.properties.image,
                                        color: f.properties.color,
                                        email: f.properties.email
                                    }));
                                setSavedPlaces(saved as SavedPin[]);
                            }}
                        />
                    )}

                    {showDetailedModal && selectedPoint && (
                        <DetailedPinModal
                            selectedPoint={selectedPoint}
                            currentUserId={userId}
                            currentUserEmail={localStorage.getItem("userEmail")}
                            onClose={() => setShowDetailedModal(false)}
                            onStatusChange={(pinId, status) => {
                                setAllPins((prev) => ({
                                    type: "FeatureCollection",
                                    features: prev.features.map((f) =>
                                        f.properties.id === pinId
                                            ? { ...f, properties: { ...f.properties, userStatus: status } }
                                            : f,
                                    ),
                                }));
                                setSelectedPoint((prev) => prev ? { ...prev, userStatus: status } : prev);
                            }}
                            onClone={(data) => {
                                setCloneValues({
                                    title: data.title,
                                    message: data.description,
                                    image: data.image,
                                    tags: data.tags,
                                });
                                setShowDetailedModal(false);
                                setSelectedPoint(null);
                                setPinData(null);
                            }}
                            onDelete={(deletedId) => {
                                setAllPins((prev) => ({
                                    type: "FeatureCollection",
                                    features: prev.features.filter(
                                        (f) => f.properties.id !== deletedId
                                    ),
                                }));
                                setSavedPlaces((prev) =>
                                    prev.filter((p) => p.id !== deletedId)
                                );
                                setSelectedPoint(null);
                                setShowDetailedModal(false);
                            }}
                            onUpdate={(updatedPoint) => {
                                setAllPins((prev) => ({
                                    type: "FeatureCollection",
                                    features: prev.features.map((f) => {
                                        if (f.properties.id === updatedPoint.id) {
                                            return {
                                                ...f,
                                                properties: {
                                                    ...f.properties,
                                                    description: updatedPoint.description,
                                                    image: updatedPoint.image,
                                                    color:
                                                        updatedPoint.color ||
                                                        f.properties.color,
                                                },
                                            };
                                        }
                                        return f;
                                    }),
                                }));
                                setSelectedPoint((prev) =>
                                    prev
                                        ? {
                                            ...prev,
                                            ...updatedPoint,
                                            color:
                                                updatedPoint.color || prev.color,
                                        }
                                        : null,
                                );
                            }}
                        />
                    )}

                    <Source
                        key={mapLayerMode}
                        id="my-data"
                        type="geojson"
                        data={allPins as unknown as GeoJSON.FeatureCollection}
                        cluster={mapLayerMode === "pins"}
                        clusterRadius={56}
                    >
                        {/* Layers must be DIRECT children of <Source>: react-map-gl clones
                            each child to inject the `source` prop, and a Fragment wrapper
                            would receive that prop and spam "Invalid prop `source` supplied
                            to React.Fragment" on every render. The heatmap fades out by zoom
                            9 while PIN_LAYER_STYLE fades in over zoom 7→9, so zooming to city
                            level reveals individual dots instead of an empty map. */}
                        {mapLayerMode === "pins" && <Layer {...CLUSTER_LAYER_STYLE} />}
                        {mapLayerMode === "pins" && <Layer {...CLUSTER_COUNT_LAYER_STYLE} />}
                        {mapLayerMode === "heatmap" && <Layer {...(HEATMAP_LAYER_STYLE as HeatmapLayerSpecification)} />}
                        <Layer {...PIN_LAYER_STYLE} />
                    </Source>

                    {/* Trip Route Line */}
                    {tripRoute && (
                        <Source id="trip-route" type="geojson" data={tripRoute}>
                            <Layer
                                id="trip-route-line"
                                type="line"
                                paint={{
                                    "line-color": "#22c55e",
                                    "line-width": 4,
                                    "line-opacity": 0.8,
                                }}
                            />
                        </Source>
                    )}

                    {/* Flight Selection Line */}
                    {flightLine && (
                        <Source id="flight-line" type="geojson" data={flightLine}>
                            <Layer
                                id="flight-line-layer"
                                type="line"
                                paint={{
                                    "line-color": "#3b82f6",
                                    "line-width": 3,
                                    "line-opacity": 0.8,
                                    "line-dasharray": [2, 2],
                                }}
                            />
                        </Source>
                    )}

                    {/* Hotel Selection Line - supports multi-colored transit segments */}
                    {hotelLine && (
                        <Source id="hotel-line" type="geojson" data={hotelLine}>
                            <Layer
                                id="hotel-line-layer"
                                type="line"
                                paint={{
                                    "line-color": ["coalesce", ["get", "color"], "#e11d48"],
                                    "line-width": 5,
                                    "line-opacity": 1,
                                }}
                            />
                        </Source>
                    )}

                    {/* Transfer Points - white dots at transit transfers */}
                    {transferPoints && (
                        <Source id="transfer-points" type="geojson" data={transferPoints}>
                            <Layer
                                id="transfer-points-layer"
                                type="circle"
                                paint={{
                                    "circle-radius": 8,
                                    "circle-color": "#ffffff",
                                    "circle-stroke-color": "#000000",
                                    "circle-stroke-width": 2,
                                }}
                            />
                        </Source>
                    )}
                </Map>
            </div>

            {mapBounds && (
                <NearbyPostsDrawer
                    mapBounds={mapBounds}
                    onPostSelect={(post) => {
                        if (post.latitude !== undefined && post.longitude !== undefined) {
                            setSelectedPoint({
                                id: post.id,
                                creatorID: post.creatorID ?? undefined,
                                longitude: post.longitude,
                                latitude: post.latitude,
                                title: post.title,
                                description: post.description || "",
                                image: post.image || "",
                                color: post.color || PIN_COLOR,
                                email: post.email || "",
                                address: post.location || "Unknown Location",
                                tags: post.tags,
                                userStatus: null,
                            });
                            setShowDetailedModal(true);
                        }
                    }}
                />
            )}

            {isLoggedIn && <SavedPlacesPanel mapRef={mapRef} />}

            {showShortcutsHelp && (
                <ShortcutsHelpModal onClose={() => setShowShortcutsHelp(false)} />
            )}

            {cloneValues && !pinData && (
                <div className="clone-banner" role="status">
                    <span className="clone-banner-text">
                        Click the map to place a similar pin.
                    </span>
                    <button
                        type="button"
                        className="clone-banner-cancel"
                        onClick={() => setCloneValues(null)}
                    >
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
}

export default HomePage;
