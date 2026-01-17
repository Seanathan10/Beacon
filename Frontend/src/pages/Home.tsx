import { useRef, useState } from "react";
import type { MapRef } from "react-map-gl/mapbox";
import "./Home.css";
import AuthModal from "@/components/AuthModal";
import SearchBar from "@/components/SearchBar";
import Map, { GeolocateControl, NavigationControl } from "react-map-gl/mapbox";
import Pin from "@/components/Pin";
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import {useControl} from 'react-map-gl/mapbox';


function DrawControl(props: DrawControlProps) {
  useControl(() => new MapboxDraw(props), {
    position: props.position
  });

  return null;
}

function HomePage() {
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const searchMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const [clickedCoords, setClickedCoords] = useState<{
        lat: number;
        lng: number;
        name?: string;
    } | null>(null);

    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
        return !!localStorage.getItem("accessToken");
    });

    const handleLogout = () => {
        localStorage.removeItem("accessToken");
        setIsLoggedIn(false);
    };

    const handleAuthSuccess = () => {
        setIsLoggedIn(true);
    };

    return (
        <div className="home-container">
            <SearchBar
                mapRef={mapRef}
                searchMarkerRef={searchMarkerRef}
                onSelectPlace={(place) =>
                    setClickedCoords({
                        lat: place.lat,
                        lng: place.lng,
                        name: place.name,
                    })
                }
            />

            <AuthModal isOpen={!isLoggedIn} onAuthSuccess={handleAuthSuccess} />

            {isLoggedIn && (
                <button onClick={handleLogout} className="logout-button">
                    Log Out
                </button>
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
                mapStyle="mapbox://styles/mapbox/streets-v12"
                onClick={(e) => {
                    console.log(e.lngLat);
                    setClickedCoords(e.lngLat);
                }}
                interactive={true}
                doubleClickZoom={true}
                dragRotate={true}
                touchZoomRotate={true}
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

                {/* <DrawControl
                    position="bottom-right"
                    displayControlsDefault={false}
                    controls={{
                        polygon: true,
                        trash: true
                    }}
                /> */}
                {clickedCoords && (
                    <Pin
                        name={clickedCoords.name ?? "GEM ALARM"}
                        latitude={clickedCoords.lat}
                        longitude={clickedCoords.lng}
                        onClose={() => setClickedCoords(null)}
                        onDetails={() => console.log("Details clicked")}
                    />
                )}
            </Map>
        </div>
    );
}

export default HomePage;
