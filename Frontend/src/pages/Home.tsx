import { useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./Home.css";
import AuthModal from "@/components/AuthModal";
import SearchBar from "@/components/SearchBar";
import Map from 'react-map-gl/mapbox';


function HomePage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const searchMarkerRef = useRef<mapboxgl.Marker | null>(null);

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
      <SearchBar mapRef={mapRef} searchMarkerRef={searchMarkerRef} />

      <AuthModal
        isOpen={!isLoggedIn}
        onAuthSuccess={handleAuthSuccess}
      />

      {isLoggedIn && (
        <button onClick={handleLogout} className="logout-button">
          Log Out
        </button>
      )}

      <Map
        ref={(ref) => {
          if (ref) mapRef.current = ref.getMap();
        }}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
        initialViewState={{
          longitude: -122.4,
          latitude: 37.8,
          zoom: 9,
        }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
      />
    </div>
  );
}

export default HomePage;
