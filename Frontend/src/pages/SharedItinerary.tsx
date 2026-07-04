import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router';
import TripPlanner, { TripPlanResult } from '../components/TripPlanner';
import mapboxgl from 'mapbox-gl';
import '../components/styles/TripPlanner.css';
import * as tripsApi from '@/services/trips';
import ShareMenu from '../components/ShareMenu';
import { toTripPlanResult, type StoredTrip } from '@/lib/trip';

export default function SharedItinerary() {
    const { id } = useParams();
    const [itineraryData, setItineraryData] = useState<TripPlanResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);

    useEffect(() => {
        const fetchItinerary = async () => {
            try {
                const data = await tripsApi.getSharedTrip<StoredTrip>(id!);
                setItineraryData(toTripPlanResult(data));
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
                <ShareMenu url={window.location.href} title="Check out this Beacon itinerary!" />
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
