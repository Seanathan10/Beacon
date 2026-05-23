import path from "path";
import { defineConfig } from "vite";
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react(), nodePolyfills()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:3000",
                changeOrigin: true,
                secure: false,
            },
            "/heartbeat": {
                target: "http://localhost:3000",
                changeOrigin: true,
                secure: false,
            },
        },
    },
    // Environment variable prefix (default is VITE_)
    envPrefix: 'VITE_',
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (
                        id.includes('/node_modules/mapbox-gl/') ||
                        id.includes('/node_modules/@mapbox/') ||
                        id.includes('/node_modules/react-map-gl/') ||
                        id.includes('/node_modules/maplibre-gl/')
                    ) {
                        return 'vendor-mapbox';
                    }
                    if (
                        id.includes('/node_modules/react-markdown/') ||
                        id.includes('/node_modules/remark') ||
                        id.includes('/node_modules/rehype') ||
                        id.includes('/node_modules/micromark') ||
                        id.includes('/node_modules/mdast') ||
                        id.includes('/node_modules/hast') ||
                        id.includes('/node_modules/unist') ||
                        id.includes('/node_modules/vfile')
                    ) {
                        return 'vendor-markdown';
                    }
                },
            },
        },
    },
});
