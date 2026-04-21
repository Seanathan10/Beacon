import { useEffect, useState } from "react";
import { getStoredMode, setStoredMode, ThemeMode } from "@/utils/theme";
import "./styles/ThemeToggle.css";

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
    light: "dark",
    dark: "system",
    system: "light",
};

const LABEL: Record<ThemeMode, string> = {
    light: "Light",
    dark: "Dark",
    system: "System",
};

export default function ThemeToggle() {
    const [mode, setMode] = useState<ThemeMode>(() => getStoredMode());

    useEffect(() => {
        // Pick up external changes (e.g., another tab writing localStorage)
        const sync = () => setMode(getStoredMode());
        window.addEventListener("storage", sync);
        return () => window.removeEventListener("storage", sync);
    }, []);

    const handleClick = () => {
        const next = NEXT_MODE[mode];
        setMode(next);
        setStoredMode(next);
    };

    return (
        <button
            type="button"
            className="theme-toggle"
            onClick={handleClick}
            aria-label={`Theme: ${LABEL[mode]}. Click to cycle.`}
            title={`Theme: ${LABEL[mode]}`}
        >
            {mode === "light" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
            )}
            {mode === "dark" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
            )}
            {mode === "system" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
            )}
        </button>
    );
}
