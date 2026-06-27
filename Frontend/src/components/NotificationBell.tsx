import { useEffect, useState } from "react";
import { BASE_API_URL } from "../../constants";

const POLL_INTERVAL_MS = 30_000;

/**
 * Bell + unread badge that polls the notification unread-count and links to the
 * full notifications page. Renders nothing when the user is logged out.
 */
export default function NotificationBell({ isLoggedIn }: { isLoggedIn: boolean }) {
    const [unread, setUnread] = useState(0);

    useEffect(() => {
        if (!isLoggedIn) return;

        let active = true;
        const controller = new AbortController();

        const poll = async () => {
            try {
                const res = await fetch(`${BASE_API_URL}/api/notifications/unread-count`, {
                    credentials: "include",
                    signal: controller.signal,
                });
                if (!res.ok) return;
                const data = await res.json();
                if (active) setUnread(data.count ?? 0);
            } catch {
                // Best-effort polling; ignore transient/aborted errors.
            }
        };

        poll();
        const timer = setInterval(poll, POLL_INTERVAL_MS);
        return () => {
            active = false;
            controller.abort();
            clearInterval(timer);
        };
    }, [isLoggedIn]);

    if (!isLoggedIn) return null;

    return (
        <a
            href="/notifications"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
            style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: "50%",
                textDecoration: "none",
                color: "var(--text-primary, #374151)",
                fontSize: 18,
                lineHeight: 1,
            }}
        >
            <span aria-hidden>🔔</span>
            {unread > 0 && (
                <span
                    style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        minWidth: 16,
                        height: 16,
                        padding: "0 4px",
                        borderRadius: 8,
                        background: "#ef4444",
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    {unread > 99 ? "99+" : unread}
                </span>
            )}
        </a>
    );
}
