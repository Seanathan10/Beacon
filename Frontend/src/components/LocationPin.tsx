import { Popup } from "react-map-gl/mapbox";
import "./LocationPin.css";

interface LocationPinProps {
	selectedPoint: {
		latitude: number;
		longitude: number;
		image: string;
		message: string;
		color?: string;
	};
	setSelectedPoint: (a: any) => void;
	onShowDetails: () => void;
}

export default function LocationPin({ selectedPoint, setSelectedPoint, onShowDetails }: LocationPinProps) {
	return (
		<Popup
			longitude={selectedPoint.longitude}
			latitude={selectedPoint.latitude}
			anchor="bottom"
			closeButton={true}
			closeOnClick={false}
			onClose={() => setSelectedPoint(null)}
			className="location-pin-popup"
		>
			<div style={{ maxWidth: '220px' }}>
				{selectedPoint.image && (
					<img
						src={selectedPoint.image}
						alt="Pin image"
						style={{
							width: '100%',
							height: '140px',
							objectFit: 'cover',
							borderRadius: '14px',
							marginBottom: '10px'
						}}
					/>
				)}
				<p style={{ 
					margin: '0 4px 8px 4px', 
					fontWeight: '600', 
					color: '#1a1a1a',
					fontSize: '15px',
					lineHeight: '1.4'
				}}>
					{selectedPoint.message}
				</p>
				<button 
					onClick={onShowDetails}
					style={{
						width: '100%',
						padding: '8px 12px',
						backgroundColor: selectedPoint.color || '#007cbf',
						color: 'white',
						border: 'none',
						borderRadius: '8px',
						fontWeight: '500',
						fontSize: '14px',
						cursor: 'pointer',
						transition: 'opacity 0.2s ease'
					}}
					onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
					onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
				>
					Additional Information
				</button>
			</div>
		</Popup>
	)
}
