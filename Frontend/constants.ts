import { CircleLayerSpecification, SymbolLayerSpecification } from "react-map-gl/mapbox";


const API_URL_DEV = "http://localhost:3000";
const API_URL_PROD = "https://api.beaconapp.live";

export const BASE_API_URL = import.meta.env.VITE_API_BASE !== undefined
    ? import.meta.env.VITE_API_BASE
    : (import.meta.env.MODE === 'development' ? API_URL_DEV : API_URL_PROD);
export const PIN_COLOR = "#007CBF";
export const USER_PIN_COLOR = "#FFC700";

export const PIN_LAYER_STYLE: CircleLayerSpecification = {
	id: "point",
	type: "circle",
	source: "my-data",
	filter: ["!", ["has", "point_count"]],
	paint: {
		"circle-radius": ["interpolate", ["linear"], ["get", "likes"], 0, 5, 20, 10],
		"circle-color": [
			"case",
			["==", ["get", "userStatus"], "visited"], "#9ca3af",
			["get", "color"],
		],
		"circle-stroke-width": 3.5,
		"circle-stroke-color": [
			"case",
			["==", ["get", "userStatus"], "visited"], "#9ca3af",
			["get", "color"],
		],
		"circle-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 9, 0.5],
		"circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 9, 1],
	},
	maxzoom: 22,
	minzoom: 5,
};

export const CLUSTER_LAYER_STYLE: CircleLayerSpecification = {
	id: "clusters",
	type: "circle",
	source: "my-data",
	filter: ["has", "point_count"],
	paint: {
		"circle-color": [
			"step",
			["get", "point_count"],
			"#2d6a4f",
			25,
			"#f59e0b",
			75,
			"#dc2626",
		],
		"circle-radius": [
			"step",
			["get", "point_count"],
			18,
			25,
			24,
			75,
			32,
		],
		"circle-opacity": 0.86,
		"circle-stroke-color": "#ffffff",
		"circle-stroke-width": 2,
	},
};

export const CLUSTER_COUNT_LAYER_STYLE: SymbolLayerSpecification = {
	id: "cluster-count",
	type: "symbol",
	source: "my-data",
	filter: ["has", "point_count"],
	layout: {
		"text-field": ["get", "point_count_abbreviated"],
		"text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
		"text-size": 12,
	},
	paint: {
		"text-color": "#ffffff",
	},
};

export const HEATMAP_LAYER_STYLE = {
	id: "pins-heat",
	type: "heatmap",
	source: "my-data",
	maxzoom: 9,
	minzoom: 0,
	paint: {
		"heatmap-weight": ["interpolate", ["linear"], ["zoom"], 0, 0, 9, 1],
		"heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 9, 3],
		"heatmap-color": [
			"interpolate",
			["linear"],
			["heatmap-density"],
			0,
			"rgba(33,102,172,0)",
			0.2,
			"rgb(103,169,207)",
			0.4,
			"rgb(209,229,240)",
			0.6,
			"rgb(253,219,199)",
			0.8,
			"rgb(239,138,98)",
			1,
			"rgb(178,24,43)",
		],
		"heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 2, 9, 20],
		"heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 1, 9, 0],
	},
};
