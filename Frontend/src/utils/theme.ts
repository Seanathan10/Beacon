export type Theme = "light" | "dark";
export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "beacon-theme";

function applyTheme(theme: Theme): void {
	document.documentElement.setAttribute("data-theme", theme);
}

// saves current theme to LocalStorage
export function getStoredMode(): ThemeMode {
	if (typeof window === "undefined") {
		return "system";
	}

	const stored = window.localStorage.getItem(STORAGE_KEY);

	if (stored === "light" || stored === "dark" || stored === "system") {
		return stored;
	}

	return "system";
}

// sets selected theme to LocalStorage
export function setStoredMode(mode: ThemeMode): void {
	if (typeof window === "undefined") return;

	if (mode === "system") {
		window.localStorage.removeItem(STORAGE_KEY);
	} else {
		window.localStorage.setItem(STORAGE_KEY, mode);
	}

	const resolved = resolveTheme(mode);

	applyTheme(resolved);

	window.dispatchEvent(
		new CustomEvent("theme-changed", { detail: { theme: resolved } }),
	);
}

export function getSystemTheme(): Theme {
	if (typeof window === "undefined") {
		return "light";
	}

	if (
		window.matchMedia &&
		window.matchMedia("(prefers-color-scheme: dark)").matches
	) {
		console.log("using dark theme from getSystemTheme()");
		return "dark";
	}

	console.log("using light theme from getSystemTheme()");
	return "light";
}

export function resolveTheme(mode: ThemeMode = getStoredMode()): Theme {
	return mode === "system" ? getSystemTheme() : mode;
}

export function getMapBoxStyleUrl(theme: Theme): string {
	if (theme === "dark") {
		console.log("using dark map from getMapBoxStyleUrl()");
		return "mapbox://styles/mapbox/dark-v11";
	}

	console.log("using light map from getMapBoxStyleUrl()");
	return "mapbox://styles/mapbox/streets-v12";
}

export function initializeTheme(): void {
	applyTheme(resolveTheme());

	if (!window.matchMedia) return;
	const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

	const handleSystemChange = () => {
		// Only react to system changes when the user hasn't picked a manual mode
		if (getStoredMode() !== "system") return;
		const next = getSystemTheme();
		applyTheme(next);
		window.dispatchEvent(
			new CustomEvent("theme-changed", { detail: { theme: next } }),
		);
	};

	mediaQuery.addEventListener("change", handleSystemChange);
}



export function onThemeChange(callback: (theme: Theme) => void): () => void {
	const handleThemeChange = (event: Event) => {
		const customEvent = event as CustomEvent;
		callback(customEvent.detail.theme);
	};

	window.addEventListener("theme-changed", handleThemeChange);
	return () => window.removeEventListener("theme-changed", handleThemeChange);
}
