import { Popup } from "react-map-gl/mapbox";
import "./styles/LocationPin.css";
import { PIN_COLOR } from "../../constants";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import * as likesApi from "@/services/likes";
import * as pinStatusApi from "@/services/pinStatus";
import { SelectedPoint } from "@/pages/Home";
import { useEffect, useState } from "react";

interface LocationPinProps {
	selectedPoint: SelectedPoint;
	setSelectedPoint: (value: SelectedPoint | null) => void;
	onShowDetails: () => void;
	onBookmarkChange?: (pinId: number, isBookmarked: boolean) => void;
	onStatusChange?: (pinId: number, status: "visited" | "wishlist" | null) => void;
}

function useIsDark() {
	const getIsDark = () => {
		const theme = localStorage.getItem("beacon-theme");
		if (theme === "dark") return true;
		if (theme === "light") return false;
		return window.matchMedia("(prefers-color-scheme: dark)").matches;
	};
	const [isDark, setIsDark] = useState(getIsDark);
	useEffect(() => {
		const handler = () => setIsDark(getIsDark());
		window.addEventListener("theme-changed", handler);
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		mq.addEventListener("change", handler);
		return () => {
			window.removeEventListener("theme-changed", handler);
			mq.removeEventListener("change", handler);
		};
	}, []);
	return isDark;
}

function HeartIcon({ filled, iconColor }: { filled: boolean; iconColor: string }) {
	return filled ? (
		<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"
			fill="#4db688">
			<path d="M0 0h24v24H0V0z" fill="none" />
			<path
				d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
		</svg>
	) : (
		<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"
			fill={iconColor}>
			<path d="M0 0h24v24H0V0z" fill="none" />
			<path
				d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" />
		</svg>
	)
}

function BookmarkIcon({ filled, iconColor }: { filled: boolean; iconColor: string }) {
	return filled ? (
		<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"
			fill="#4db688">
			<path d="M0 0h24v24H0V0z" fill="none" />
			<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
		</svg>
	) : (
		<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"
			fill={iconColor}>
			<path d="M0 0h24v24H0V0z" fill="none" />
			<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z" />
		</svg>
	)
}

function CheckIcon({ filled, iconColor }: { filled: boolean; iconColor: string }) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px"
			fill={filled ? "#4db688" : iconColor}>
			<path d="M0 0h24v24H0V0z" fill="none" />
			<path d="M9 16.2l-3.5-3.5a.984.984 0 0 0-1.4 0 .984.984 0 0 0 0 1.4l4.19 4.19c.39.39 1.02.39 1.41 0L20.3 7.7a.984.984 0 0 0 0-1.4.984.984 0 0 0-1.4 0L9 16.2z" />
		</svg>
	);
}

function StarIcon({ filled, iconColor }: { filled: boolean; iconColor: string }) {
	return filled ? (
		<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="#4db688">
			<path d="M0 0h24v24H0V0z" fill="none" />
			<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
		</svg>
	) : (
		<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill={iconColor}>
			<path d="M0 0h24v24H0V0z" fill="none" />
			<path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z" />
		</svg>
	);
}

function InfoIcon({ iconColor }: { iconColor: string }) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill={iconColor}>
			<path d="M0 0h24v24H0V0z" fill="none" />
			<path
				d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
		</svg>
	)
}

export default function LocationPin({ selectedPoint, setSelectedPoint, onShowDetails, onBookmarkChange, onStatusChange }: LocationPinProps) {
	const { userEmail } = useAuth();
	const isDark = useIsDark();
	const textPrimary = isDark ? "#e5e7eb" : "#1a1a1a";
	const textSecondary = isDark ? "#9ca3af" : "#6b7280";
	const iconColor = isDark ? "#e5e7eb" : "#1f1f1f";

	const titleText = selectedPoint.title?.trim() || selectedPoint.description?.trim() || "Untitled Pin";
	const messageText = selectedPoint.description?.trim() || "";
	const showMessage = messageText && messageText !== titleText;
	const descriptionPreview = messageText.length > 50 ? `${messageText.slice(0, 50).trimEnd()}...` : messageText;

	const [likes, setLikes] = useState<number>(0);
	const [isLiked, setIsLiked] = useState<boolean>(false);
	const [isBookmarked, setIsBookmarked] = useState<boolean>(false);
	const [likesLoading, setLikesLoading] = useState<boolean>(true);
	const [prevId, setPrevId] = useState<number | undefined>(selectedPoint.id);
	const [userStatus, setUserStatus] = useState<"visited" | "wishlist" | null>(selectedPoint.userStatus ?? null);

	if (selectedPoint.id !== prevId) {
		setPrevId(selectedPoint.id);
		setUserStatus(selectedPoint.userStatus ?? null);
		setLikesLoading(true);
	}

	useEffect(() => {
		// Check if pin is bookmarked
		const saved = (() => { try { return JSON.parse(localStorage.getItem("savedPins") ?? '{}'); } catch { return {}; } })();
		const email = userEmail;
		const userSavedPins = saved[email] || [];
		const bookmarked = userSavedPins.includes(selectedPoint.id);

		// Fetch likes, then update all state in callbacks
		likesApi.getLikes(selectedPoint.id!)
			.then(res => {
				setIsBookmarked(bookmarked);
				setLikes(res.likes);
				setIsLiked(res.wasLiked);
				setLikesLoading(false);
			})
			.catch(() => {
				setIsBookmarked(bookmarked);
				setLikesLoading(false);
			});
	}, [selectedPoint, userEmail]);

	const toggleLike = () => {
		const prevLiked = isLiked;
		const prevLikes = likes;
		const newLikedState = !isLiked;
		setIsLiked(newLikedState);
		setLikes(prev => prev + (newLikedState ? 1 : -1));

		const request = newLikedState
			? likesApi.addLike(selectedPoint.id!)
			: likesApi.removeLike(selectedPoint.id!);
		request.catch((err) => {
			// 409 means already in the desired state — treat as success.
			if (err instanceof ApiError && err.status === 409) return;
			setIsLiked(prevLiked);
			setLikes(prevLikes);
		});
	};

	const toggleStatus = (next: "visited" | "wishlist") => {
		if (!selectedPoint.id) return;
		const prev = userStatus;
		const newStatus = prev === next ? null : next;
		setUserStatus(newStatus);
		onStatusChange?.(selectedPoint.id, newStatus);

		const request = newStatus
			? pinStatusApi.setPinStatus(selectedPoint.id, newStatus)
			: pinStatusApi.deletePinStatus(selectedPoint.id);

		request.catch((err) => {
			// 404 means the status was already absent — treat as success.
			if (err instanceof ApiError && err.status === 404) return;
			setUserStatus(prev);
			onStatusChange?.(selectedPoint.id!, prev);
		});
	};

	const toggleBookmark = () => {
		const saved = (() => { try { return JSON.parse(localStorage.getItem("savedPins") ?? '{}'); } catch { return {}; } })();
		const email = userEmail;
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
						color: textPrimary,
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
							color: textSecondary,
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
						<InfoIcon iconColor={iconColor} />
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
							color: textPrimary,
							padding: '4px 8px',
							opacity: likesLoading ? 0.5 : 1,
						}}
					>
						<HeartIcon filled={isLiked} iconColor={iconColor} />
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
							color: textPrimary,
							padding: '4px 8px',
							opacity: likesLoading ? 0.5 : 1,
						}}
					>
						<BookmarkIcon filled={isBookmarked} iconColor={iconColor} />
					</button>

					<button
						className="location-popup-button"
						onClick={() => toggleStatus("visited")}
						aria-label="Mark as visited"
						title={userStatus === "visited" ? "Visited" : "Mark as visited"}
						onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
						onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							background: 'none',
							color: textPrimary,
							padding: '4px 8px',
						}}
					>
						<CheckIcon filled={userStatus === "visited"} iconColor={iconColor} />
					</button>

					<button
						className="location-popup-button"
						onClick={() => toggleStatus("wishlist")}
						aria-label="Add to wishlist"
						title={userStatus === "wishlist" ? "On wishlist" : "Add to wishlist"}
						onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
						onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							background: 'none',
							color: textPrimary,
							padding: '4px 8px',
						}}
					>
						<StarIcon filled={userStatus === "wishlist"} iconColor={iconColor} />
					</button>
				</div>
			</div>
		</Popup>
	);
}
