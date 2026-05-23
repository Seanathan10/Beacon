import { useParams, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import { Bookmark, PublicCollection as PublicCollectionData } from "../types/bookmarks";
import { BASE_API_URL } from "../../constants";
import ShareMenu from "../components/ShareMenu";


export default function PublicCollection() {
  const { folderID } = useParams<{ folderID: string }>();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<PublicCollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!folderID) return;

    const fetchCollection = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${BASE_API_URL}/api/share/collection/${folderID}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError("Collection not found");
          } else if (response.status === 403) {
            setError("This collection is private");
          } else {
            setError("Failed to load collection");
          }
          return;
        }

        const data = await response.json();
        setCollection(data);
        setError(null);
      } catch (err) {
        setError("Failed to load collection");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchCollection();
  }, [folderID]);

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading collection...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 text-lg mb-4">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!collection) {
    return null;
  }

  return (
    <div className="w-full min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-start justify-between">
            <div>
              <button
                onClick={() => navigate("/")}
                className="text-blue-500 hover:text-blue-600 mb-2"
              >
                ← Back
              </button>
              <h1 className="text-3xl font-bold text-gray-900">
                {collection.folder.name}
              </h1>
              <p className="text-gray-600 mt-1">
                {collection.folder.pinCount} {collection.folder.pinCount === 1 ? 'location' : 'locations'}
              </p>
            </div>
            <ShareMenu
              url={`${window.location.origin}/collection/${folderID}`}
              title={collection ? `${collection.folder.name} — Beacon Collection` : "Check out this Beacon collection!"}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {collection.pins.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No locations in this collection yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {collection.pins.map((pin) => (
              <CollectionPinCard key={pin.pinID} pin={pin} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CollectionPinCard({ pin }: { pin: Bookmark }) {
  return (
    <div className="bg-white rounded-lg shadow hover:shadow-lg transition overflow-hidden">
      {pin.image && (
        <img
          src={pin.image}
          alt={pin.title}
          className="w-full h-48 object-cover"
        />
      )}
      <div className="p-4">
        <h3 className="font-bold text-lg text-gray-900 line-clamp-2">
          {pin.title || 'Untitled'}
        </h3>
        {pin.address && (
          <p className="text-sm text-gray-600 mt-1 line-clamp-1">
            📍 {pin.address}
          </p>
        )}
        {pin.description && (
          <p className="text-sm text-gray-600 mt-2 line-clamp-2">
            {pin.description}
          </p>
        )}
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-gray-500">
            by {pin.email}
          </span>
          <span className="text-sm font-medium text-red-500">
            ❤️ {pin.likes}
          </span>
        </div>
      </div>
    </div>
  );
}
