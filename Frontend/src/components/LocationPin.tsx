import { Popup } from "react-map-gl/mapbox";
import "./styles/LocationPin.css";
import { PIN_COLOR, BASE_API_URL } from "../../constants";
import { SelectedPoint } from "@/pages/Home";
import { useEffect, useState } from "react";

interface LocationPinProps {
	selectedPoint: SelectedPoint;
	setSelectedPoint: (a: any) => void;
	onShowDetails: () => void;
	onBookmarkChange?: (pinId: number, isBookmarked: boolean) => void;
}

function HeartIcon({ filled }: { filled: boolean }) {
	return filled ? (
		<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"
			fill="#4db688">
			<path d="M0 0h24v24H0V0z" fill="none" />
			<path
				d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
		</svg>
	) : (
		<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"
			fill="#1f1f1f">
			<path d="M0 0h24v24H0V0z" fill="none" />
			<path
				d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" />
		</svg>
	)
}

function BookmarkIcon({ filled }: { filled: boolean }) {
	return filled ? (
		<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"
			fill="#4db688">
			<path d="M0 0h24v24H0V0z" fill="none" />
			<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
		</svg>
	) : (
		<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"
			fill="#1f1f1f">
			<path d="M0 0h24v24H0V0z" fill="none" />
			<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z" />
		</svg>
	)
}

function InfoIcon() {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="#1f1f1f">
			<path d="M0 0h24v24H0V0z" fill="none" />
			<path
				d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
		</svg>
	)
}

export default function LocationPin({ selectedPoint, setSelectedPoint, onShowDetails, onBookmarkChange }: LocationPinProps) {
	const titleText = selectedPoint.title?.trim() || selectedPoint.description?.trim() || "Untitled Pin";
	const messageText = selectedPoint.description?.trim() || "";
	const showMessage = messageText && messageText !== titleText;
	const descriptionPreview = messageText.length > 50 ? `${messageText.slice(0, 50).trimEnd()}...` : messageText;

	const [likes, setLikes] = useState<number>(0);
	const [isLiked, setIsLiked] = useState<boolean>(false);
	const [isBookmarked, setIsBookmarked] = useState<boolean>(false);
	const [likesLoading, setLikesLoading] = useState<boolean>(true);

	useEffect(() => {
		// Check if pin is bookmarked
		const saved = JSON.parse(localStorage.getItem("savedPins") ?? '{}');
		const email = localStorage.getItem("userEmail")!;
		const userSavedPins = saved[email] || [];
		setIsBookmarked(userSavedPins.includes(selectedPoint.id));

		// Fetch likes
		setLikesLoading(true);
		fetch(`${BASE_API_URL}/api/likes/${selectedPoint.id}`, {
			headers: {
				Authorization: `Bearer ${localStorage.getItem("accessToken")}`
			}
		})
			.then(res => res.json())
			.then(res => {
				setLikes(res.likes);
				setIsLiked(res.wasLiked);
				setLikesLoading(false);
			})
			.catch(() => {
				setLikesLoading(false);
			});
	}, [selectedPoint]);

	const toggleLike = () => {
		const newLikedState = !isLiked;
		setIsLiked(newLikedState);

		if (newLikedState) {
			setLikes(prev => prev + 1);
			fetch(`${BASE_API_URL}/api/likes/${selectedPoint.id}`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${localStorage.getItem("accessToken")}`
				}
			});
		} else {
			setLikes(prev => prev - 1);
			fetch(`${BASE_API_URL}/api/likes/${selectedPoint.id}`, {
				method: 'DELETE',
				headers: {
					Authorization: `Bearer ${localStorage.getItem("accessToken")}`
				}
			});
		}
	};

	const toggleBookmark = () => {
		const saved = JSON.parse(localStorage.getItem("savedPins") ?? '{}');
		const email = localStorage.getItem("userEmail")!;
		const newSavedState = !isBookmarked;
		setIsBookmarked(newSavedState);

		if (!saved[email]) {
			saved[email] = [];
		}

		if (newSavedState) {
			if (!saved[email].includes(selectedPoint.id)) {
				saved[email].push(selectedPoint.id);
			}
		} else {
			saved[email] = saved[email].filter((id: number) => id !== selectedPoint.id);
		}

		localStorage.setItem("savedPins", JSON.stringify(saved));
		onBookmarkChange?.(selectedPoint.id!, newSavedState);
	};


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
			<div style={{ maxWidth: "220px" }}>
				<div
					style={{
						margin: "0 4px 8px 4px",
						fontWeight: "700",
						color: "#1a1a1a",
						fontSize: "16px",
						lineHeight: "1.4",
					}}
				>
					{titleText}
				</div>
				{selectedPoint.image ? (
					<img
						src={selectedPoint.image}
						alt="Pin image"
						style={{
							width: "100%",
							height: "140px",
							objectFit: "cover",
							borderRadius: "14px",
							marginBottom: "10px",
						}}
					/>
				) : (
					<div
						className="location-pin-image-placeholder"
						style={{
							background: `linear-gradient(135deg, ${selectedPoint.color || PIN_COLOR}88 0%, ${selectedPoint.color || PIN_COLOR} 100%)`,
						}}
					>
						{titleText.charAt(0).toUpperCase()}
					</div>
				)}
				{showMessage && (
					<p
						style={{
							margin: "0 4px 8px 4px",
							fontWeight: "500",
							color: "#6b7280",
							fontSize: "14px",
							lineHeight: "1.4",
						}}
					>
						{descriptionPreview}
					</p>
				)}
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
					<button
						className="location-popup-button"
						onClick={onShowDetails}
						style={{ background: 'none', padding: '4px 8px', transform: 'translateY(3px)'}}
						onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
						onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
					>
						<InfoIcon />
					</button>

					<button
						className="location-popup-button"
						onClick={toggleLike}
						disabled={likesLoading}
						onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
						onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							background: 'none',
							color: '#1a1a1a',
							padding: '4px 8px',
							opacity: likesLoading ? 0.5 : 1,
						}}
					>
						<HeartIcon filled={isLiked} />
						<p>{likesLoading ? '...' : likes}</p>
					</button>

					<button
						className="location-popup-button"
						onClick={toggleBookmark}
						disabled={likesLoading}
						onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
						onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							background: 'none',
							color: '#1a1a1a',
							padding: '4px 8px',
							opacity: likesLoading ? 0.5 : 1,
						}}
					>
						<BookmarkIcon filled={isBookmarked} />
					</button>
				</div>
			</div>
		</Popup>
	);
}
