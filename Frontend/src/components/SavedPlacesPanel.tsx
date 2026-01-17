import { useEffect, useState } from "react";
import "./SavedPlacesPanel.css";

interface SavedPlace {
    id: string;
    name?: string;
    message?: string;
    latitude?: number;
    longitude?: number;
}

function SavedPlacesPanel() {
    const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        const fetchSavedPlaces = async () => {
            try {
                const token = localStorage.getItem("accessToken");
                if (!token) {
                    setIsLoading(false);
                    return;
                }

                const res = await fetch("/api/pins/user", {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    setSavedPlaces(data);
                } else {
                    console.error("Failed to fetch saved places - Status:", res.status, res.statusText);
                    const errorData = await res.text();
                    console.error("Error response:", errorData);
                }
            } catch (error) {
                console.error("Error fetching saved places:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSavedPlaces();
    }, []);

    if (!localStorage.getItem("accessToken")) {
        return null; // Don't show if not logged in
    }

    return (
        <div className={`saved-places-panel ${isExpanded ? "expanded" : "collapsed"}`}>
            <button 
                className="panel-toggle" 
                onClick={() => setIsExpanded(!isExpanded)}
                title="Toggle Saved Places"
            >
                {isExpanded ? "−" : "+"}
            </button>

            {isExpanded && (
                <div className="panel-content">
                    <h3>Your Saved Places</h3>
                    
                    {isLoading ? (
                        <p className="loading">Loading...</p>
                    ) : savedPlaces.length === 0 ? (
                        <p className="empty">No saved places yet</p>
                    ) : (
                        <ul className="places-list">
                            {savedPlaces.map((place) => (
                                <li key={place.id} className="place-item">
                                    <span className="place-name">
                                        {place.name || `Place #${place.id}`}
                                    </span>
                                    {place.message && (
                                        <span className="place-message">{place.message}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

export default SavedPlacesPanel;
