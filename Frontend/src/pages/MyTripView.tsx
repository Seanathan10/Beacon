import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import TripPlanner, { TripPlanResult } from '../components/TripPlanner';
import mapboxgl from 'mapbox-gl';
import '../components/styles/TripPlanner.css';
import * as tripsApi from '@/services/trips';
import { ApiError } from '@/lib/api';
import ShareMenu from '../components/ShareMenu';
import { toTripPlanResult, type StoredTrip } from '@/lib/trip';

/**
 * Owner-scoped read view of a saved trip. Unlike SharedItinerary (which loads
 * the public /api/share/:id snapshot), this fetches /api/me/trips/:id so the
 * owner can open their private drafts as well as published trips.
 */
export default function MyTripView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [itineraryData, setItineraryData] = useState<TripPlanResult | null>(null);
    const [isPublic, setIsPublic] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);

    useEffect(() => {
        const fetchTrip = async () => {
            try {
                const data = await tripsApi.getMyTrip<StoredTrip>(id!);
                setIsPublic(!!data.isPublic);
                setItineraryData(toTripPlanResult(data));
            } catch (err) {
                if (err instanceof ApiError && err.status === 401) { navigate('/'); return; }
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchTrip();
    }, [id, navigate]);

    if (loading) {
        return (
            <div className="shared-loading-screen">
                <div className="loading-content">
                    <div className="loading-spinner-large"></div>
                    <h2>Loading your trip...</h2>
                </div>
            </div>
        );
    }

    if (error || !itineraryData) {
        return (
            <div className="shared-error-screen">
                <div className="error-content">
                    <span className="error-icon">🔍</span>
                    <h2>Trip not found</h2>
                    <p>{error || "This trip doesn't exist or isn't yours."}</p>
                    <a href="/my-trips" className="back-home-btn">← Back to My Trips</a>
                </div>
            </div>
        );
    }

    return (
        <div className="shared-itinerary-page">
            <div className="shared-itinerary-header">
                <a href="/my-trips" className="back-link">← Back to My Trips</a>
                <span className="shared-badge">{isPublic ? '📤 Shared Trip' : '📝 Draft'}</span>
                {isPublic && (
                    <ShareMenu
                        url={`${window.location.origin}/shared/${id}`}
                        title="Check out this Beacon itinerary!"
                    />
                )}
            </div>
            <TripPlanner
                isOpen={true}
                onClose={() => { window.location.href = '/my-trips'; }}
                onPlanComplete={() => { }}
                mapRef={mapRef}
                initialResult={itineraryData}
                isSharedView={true}
            />
        </div>
    );
}
