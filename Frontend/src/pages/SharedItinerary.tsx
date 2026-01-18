import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router';
import TripPlanner, { TripPlanResult } from '../components/TripPlanner';
import mapboxgl from 'mapbox-gl';
import '../components/styles/TripPlanner.css';
import { BASE_API_URL } from '../../constants';

export default function SharedItinerary() {
    const { id } = useParams();
    const [itineraryData, setItineraryData] = useState<TripPlanResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);

    useEffect(() => {
        const fetchItinerary = async () => {
            try {
                const res = await fetch(`${BASE_API_URL}/api/share/${id}`);
                if (!res.ok) throw new Error('Failed to load itinerary');
                const data = await res.json();

                // Transform backend data to TripPlanResult structure
                // The backend stores: { itinerary, itineraryType, settings }
                const tripResult: TripPlanResult = {
                    itinerary: data.itinerary,
                    itineraryType: data.itineraryType || 'Adventure',
                    origin: data.settings?.origin || 'Unknown',
                    destination: data.settings?.destination || 'Unknown',
                    durationDays: data.settings?.durationDays || 7,
                    transitOptions: data.settings?.transitOptions || [],
                    ecoHotels: data.settings?.ecoHotels || [],
                    localPins: data.settings?.localPins || [],
                    carbonStats: data.settings?.carbonStats || {
                        bestOption: { mode: 'unknown', carbonKg: 0 },
                        worstOption: { mode: 'unknown', carbonKg: 0 },
                        typicalTouristKg: 0,
                        savingsVsTypical: 0,
                        offsetCostUsd: 0
                    },
                    originCoords: data.settings?.originCoords,
                    destCoords: data.settings?.destCoords,
                    routePolylines: data.settings?.routePolylines || [],
                };
                setItineraryData(tripResult);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchItinerary();
    }, [id]);

    if (loading) {
        return (
            <div className="shared-loading-screen">
                <div className="loading-content">
                    <div className="loading-spinner-large"></div>
                    <h2>Loading shared itinerary...</h2>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="shared-error-screen">
                <div className="error-content">
                    <span className="error-icon">😕</span>
                    <h2>Oops! Something went wrong</h2>
                    <p>{error}</p>
                    <a href="/" className="back-home-btn">← Back to Home</a>
                </div>
            </div>
        );
    }

    if (!itineraryData) {
        return (
            <div className="shared-error-screen">
                <div className="error-content">
                    <span className="error-icon">🔍</span>
                    <h2>Itinerary not found</h2>
                    <p>This shared itinerary may have expired or doesn't exist.</p>
                    <a href="/" className="back-home-btn">← Back to Home</a>
                </div>
            </div>
        );
    }

    return (
        <div className="shared-itinerary-page">
            <div className="shared-itinerary-header">
                <a href="/" className="back-link">← Back to Beacon</a>
                <span className="shared-badge">📤 Shared Itinerary</span>
            </div>
            <TripPlanner
                isOpen={true}
                onClose={() => { window.location.href = '/'; }}
                onPlanComplete={() => { }}
                mapRef={mapRef}
                initialResult={itineraryData}
                isSharedView={true}
            />
        </div>
    );
}
