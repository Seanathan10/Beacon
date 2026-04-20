/**
 * Theme utilities for system dark mode detection and application
 */

export type Theme = 'light' | 'dark';

/**
 * Get the current system theme preference
 */
export function getSystemTheme(): Theme {
    if (typeof window === 'undefined') return 'light';
    
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

/**
 * Get the appropriate MapBox style URL based on theme
 */
export function getMapBoxStyleUrl(theme: Theme): string {
    // Mapbox provides these official styles
    if (theme === 'dark') {
        return 'mapbox://styles/mapbox/dark-v11';
    }
    return 'mapbox://styles/mapbox/streets-v12';
}

/**
 * Initialize theme detection and set up listeners
 * Applies theme immediately and listens for system preference changes
 */
export function initializeTheme(): void {
    applyTheme(getSystemTheme());
    
    // Listen for system theme changes
    if (window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        
        // Modern API: addEventListener
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', (e) => {
                applyTheme(e.matches ? 'dark' : 'light');
                // Dispatch custom event for components to react to theme change
                window.dispatchEvent(new CustomEvent('theme-changed', { 
                    detail: { theme: e.matches ? 'dark' : 'light' } 
                }));
            });
        }
        // Fallback for older browsers
        else if (mediaQuery.addListener) {
            mediaQuery.addListener((e) => {
                applyTheme(e.matches ? 'dark' : 'light');
                window.dispatchEvent(new CustomEvent('theme-changed', { 
                    detail: { theme: e.matches ? 'dark' : 'light' } 
                }));
            });
        }
    }
}

/**
 * Apply theme to the document
 * CSS media queries will automatically pick up the prefers-color-scheme change
 */
function applyTheme(theme: Theme): void {
    // Set data attribute for CSS targeting if needed
    document.documentElement.setAttribute('data-theme', theme);
    
    // CSS variables are automatically applied via @media (prefers-color-scheme)
    // No need to manually set them as the browser will handle it
}

/**
 * Listen for theme changes and execute callback
 */
export function onThemeChange(callback: (theme: Theme) => void): () => void {
    const handleThemeChange = (event: Event) => {
        const customEvent = event as CustomEvent;
        callback(customEvent.detail.theme);
    };
    
    window.addEventListener('theme-changed', handleThemeChange);
    
    // Return unsubscribe function
    return () => window.removeEventListener('theme-changed', handleThemeChange);
}
