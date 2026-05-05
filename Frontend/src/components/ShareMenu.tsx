import { useState, useRef, useEffect } from "react";

interface ShareMenuProps {
    url: string;
    title?: string;
    className?: string;
}

export default function ShareMenu({ url, title = "Check this out on Beacon!", className = "" }: ShareMenuProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    function copyLink() {
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    function shareTwitter() {
        window.open(
            `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
            "_blank",
            "noopener,noreferrer"
        );
    }

    function shareFacebook() {
        window.open(
            `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
            "_blank",
            "noopener,noreferrer"
        );
    }

    function shareNative() {
        if (navigator.share) {
            navigator.share({ title, url }).catch(() => {});
        }
    }

    const hasNativeShare = typeof navigator !== "undefined" && !!navigator.share;

    return (
        <div ref={ref} className={`share-menu-wrapper ${className}`} style={{ position: "relative", display: "inline-block" }}>
            <button
                onClick={() => setOpen((o) => !o)}
                style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 8px",
                    borderRadius: 4,
                    fontSize: 14,
                }}
                title="Share"
                aria-label="Share"
            >
                Share
            </button>

            {open && (
                <div
                    style={{
                        position: "absolute",
                        top: "100%",
                        right: 0,
                        zIndex: 1000,
                        background: "var(--bg-secondary, #fff)",
                        border: "1px solid var(--border-color, #ddd)",
                        borderRadius: 8,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        minWidth: 160,
                        padding: "4px 0",
                    }}
                >
                    <button onClick={copyLink} style={itemStyle}>
                        {copied ? "Copied!" : "Copy link"}
                    </button>
                    <button onClick={shareTwitter} style={itemStyle}>
                        Share on X/Twitter
                    </button>
                    <button onClick={shareFacebook} style={itemStyle}>
                        Share on Facebook
                    </button>
                    {hasNativeShare && (
                        <button onClick={shareNative} style={itemStyle}>
                            More options...
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

const itemStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "8px 16px",
    fontSize: 14,
    color: "inherit",
};
