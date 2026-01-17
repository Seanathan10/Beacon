import "./DetailedPinModal.css";

interface DetailedPinModalProps {
	selectedPoint: {
		id?: number;
		creatorID?: number;
		latitude: number;
		longitude: number;
		message: string;
		image: string;
		color?: string;
		email?: string;
	};
	onClose: () => void;
}

export default function DetailedPinModal({ selectedPoint, onClose }: DetailedPinModalProps) {
	return (
		<div className="detailed-modal-overlay" onClick={onClose}>
			<div className="detailed-modal" onClick={(e) => e.stopPropagation()}>
				<div className="detailed-modal-header">
					<h2>Pin Details</h2>
					<button 
						className="detailed-modal-close"
						onClick={onClose}
						aria-label="Close"
					>
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<line x1="18" y1="6" x2="6" y2="18"></line>
							<line x1="6" y1="6" x2="18" y2="18"></line>
						</svg>
					</button>
				</div>

				<div className="detailed-modal-content">
					{selectedPoint.image && (
						<img
							src={selectedPoint.image}
							alt="Pin location"
							className="detailed-modal-image"
						/>
					)}

					<div className="detailed-info-section">
						<h3>Description</h3>
						<p className="detailed-message">{selectedPoint.message}</p>
					</div>

					{selectedPoint.email && (
						<div className="detailed-info-section">
							<h3>Uploaded by</h3>
							<p className="detailed-message">{selectedPoint.email}</p>
						</div>
					)}

					<div className="detailed-info-section">
						<h3>Location</h3>
						<div className="location-details">
							<div className="detail-item">
								<span className="detail-label">Latitude</span>
								<span className="detail-value">{selectedPoint.latitude.toFixed(6)}</span>
							</div>
							<div className="detail-item">
								<span className="detail-label">Longitude</span>
								<span className="detail-value">{selectedPoint.longitude.toFixed(6)}</span>
							</div>
						</div>
					</div>

					{selectedPoint.color && (
						<div className="detailed-info-section">
							<h3>Pin Color</h3>
							<div className="color-display">
								<div 
									className="color-swatch"
									style={{ backgroundColor: selectedPoint.color }}
								/>
								<span className="color-code">{selectedPoint.color}</span>
							</div>
						</div>
					)}

					<div className="detailed-modal-actions">
						<button 
							className="action-button secondary"
							onClick={onClose}
						>
							Close
						</button>
						<a 
							href={`https://www.google.com/maps/?q=${selectedPoint.latitude},${selectedPoint.longitude}`}
							target="_blank"
							rel="noopener noreferrer"
							className="action-button primary"
						>
							Open in Google Maps
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
