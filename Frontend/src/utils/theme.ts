export type Theme = 'light' | 'dark';
export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'beacon-theme';

export function getStoredMode(): ThemeMode {
    if (typeof window === 'undefined') return 'system';
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
    }
    return 'system';
}

export function setStoredMode(mode: ThemeMode): void {
    if (typeof window === 'undefined') return;
    if (mode === 'system') {
        window.localStorage.removeItem(STORAGE_KEY);
    } else {
        window.localStorage.setItem(STORAGE_KEY, mode);
    }
    const resolved = resolveTheme(mode);
    applyTheme(resolved);
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: resolved } }));
}

export function getSystemTheme(): Theme {
    if (typeof window === 'undefined') return 'light';
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

export function resolveTheme(mode: ThemeMode = getStoredMode()): Theme {
    return mode === 'system' ? getSystemTheme() : mode;
}

export function getMapBoxStyleUrl(theme: Theme): string {
    if (theme === 'dark') {
        return 'mapbox://styles/mapbox/dark-v11';
    }
    return 'mapbox://styles/mapbox/streets-v12';
}

export function initializeTheme(): void {
    applyTheme(resolveTheme());

    if (!window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemChange = () => {
        // Only react to system changes when the user hasn't picked a manual mode
        if (getStoredMode() !== 'system') return;
        const next = getSystemTheme();
        applyTheme(next);
        window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: next } }));
    };

    if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleSystemChange);
    } else {
        // Safari < 14 fallback: pre-standard addListener
        const legacy = mediaQuery as MediaQueryList & {
            addListener?: (listener: (ev: MediaQueryListEvent) => void) => void;
        };
        legacy.addListener?.(handleSystemChange);
    }
}

function applyTheme(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
}

export function onThemeChange(callback: (theme: Theme) => void): () => void {
    const handleThemeChange = (event: Event) => {
        const customEvent = event as CustomEvent;
        callback(customEvent.detail.theme);
    };

    window.addEventListener('theme-changed', handleThemeChange);
    return () => window.removeEventListener('theme-changed', handleThemeChange);
}
