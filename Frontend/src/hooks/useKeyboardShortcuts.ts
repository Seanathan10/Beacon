import { useEffect } from "react";

interface ShortcutHandlers {
    onSearch?: () => void;
    onCreate?: () => void;
    onHelp?: () => void;
    enabled?: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    return false;
}

export function useKeyboardShortcuts({ onSearch, onCreate, onHelp, enabled = true }: ShortcutHandlers) {
    useEffect(() => {
        if (!enabled) return;

        const handler = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (isTypingTarget(e.target)) return;

            if (e.key === "/" && onSearch) {
                e.preventDefault();
                onSearch();
                return;
            }
            if (e.key === "?" && onHelp) {
                e.preventDefault();
                onHelp();
                return;
            }
            // `c` — create. Lowercase only; let Shift+C pass through.
            if (e.key === "c" && onCreate) {
                e.preventDefault();
                onCreate();
                return;
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onSearch, onCreate, onHelp, enabled]);
}
