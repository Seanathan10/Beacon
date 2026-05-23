import { useEffect, useState, useCallback } from "react";
import "./styles/ShortcutsHelpModal.css";

interface ShortcutsHelpModalProps {
    onClose: () => void;
}

const SHORTCUTS: { keys: string[]; description: string }[] = [
    { keys: ["/"], description: "Focus search" },
    { keys: ["c"], description: "Drop a pin at the current map center" },
    { keys: ["?"], description: "Show this shortcut help" },
    { keys: ["Esc"], description: "Close open modals" },
];

export default function ShortcutsHelpModal({ onClose }: ShortcutsHelpModalProps) {
    const [isClosing, setIsClosing] = useState(false);

    const handleClose = useCallback(() => {
        setIsClosing(true);
        setTimeout(onClose, 200);
    }, [onClose]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [handleClose]);

    return (
        <div className={`shortcuts-modal-overlay ${isClosing ? "is-closing" : ""}`} onClick={handleClose}>
            <div className={`shortcuts-modal ${isClosing ? "is-closing" : ""}`} onClick={(e) => e.stopPropagation()}>
                <div className="shortcuts-modal-header">
                    <h2>Keyboard Shortcuts</h2>
                    <button className="shortcuts-modal-close" onClick={handleClose} aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <ul className="shortcuts-list">
                    {SHORTCUTS.map(({ keys, description }) => (
                        <li key={description} className="shortcuts-row">
                            <span className="shortcuts-description">{description}</span>
                            <span className="shortcuts-keys">
                                {keys.map((k, i) => (
                                    <kbd key={i} className="shortcut-key">{k}</kbd>
                                ))}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
