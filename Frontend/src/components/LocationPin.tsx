import { Popup } from "react-map-gl/mapbox";
import "./LocationPin.css";

interface LocationPinProps {
	selectedPoint: {
		latitude: number;
		longitude: number;
		image: string;
		message: string;
	};
	setSelectedPoint: (a: any) => void;
}

export default function LocationPin({ selectedPoint, setSelectedPoint }: LocationPinProps) {
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
					margin: '0 4px 4px 4px', 
					fontWeight: '600', 
					color: '#1a1a1a',
					fontSize: '15px',
					lineHeight: '1.4'
				}}>
					{selectedPoint.message}
				</p>
			</div>
		</Popup>
	)
}
