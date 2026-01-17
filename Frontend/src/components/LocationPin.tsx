import { Popup } from "react-map-gl/mapbox";

interface LocationPinProps {
	latitude: number;
	longitude: number;
	image: string;
	message: string;
	setSelectedPoint: (a: any) => void;
}

export default function LocationPin(selectedPoint: LocationPinProps) {
	return (
		<Popup
			longitude={selectedPoint.longitude}
			latitude={selectedPoint.latitude}
			anchor="bottom"
			closeButton={true}
			closeOnClick={false}
			onClose={() => selectedPoint.setSelectedPoint(null)}
		>
			<div style={{ maxWidth: '200px' }}>
				{selectedPoint.image && (
					<img
						src={selectedPoint.image}
						alt="Pin image"
						style={{
							width: '100%',
							height: '120px',
							objectFit: 'cover',
							borderRadius: '8px',
							marginBottom: '8px'
						}}
					/>
				)}
				<p style={{ margin: 0, fontWeight: 'bold' }}>{selectedPoint.message}</p>
			</div>
		</Popup>
	)
}