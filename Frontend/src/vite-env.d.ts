/// <reference types="vite/client" />

interface Window {
	plausible?: (
		event: string,
		options?: { props?: Record<string, string | number | boolean> },
	) => void;
}

interface ImportMetaEnv {
	readonly VITE_MAPBOX_ACCESS_TOKEN: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
