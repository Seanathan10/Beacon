import { useState, useCallback } from "react";
import { BASE_API_URL } from "../../constants";

export default function AuthHook() {
	const [userEmail, setUserEmail] = useState<string>(() => {
        return localStorage.getItem("userEmail") || "";
    });

	const [userId, setUserId] = useState<number | null>(() => {
        const id = localStorage.getItem("userId");
        return id ? parseInt(id) : null;
    });

	const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
        return localStorage.getItem("isLoggedIn") === "true";
    });

	// Stable identities so consumers (and memoized children like AuthModal) don't
	// re-render every time the parent renders.
	const logout = useCallback(() => {
        fetch(`${BASE_API_URL}/api/logout`, { method: "POST", credentials: "include" }).catch(() => {});
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("userId");
        setIsLoggedIn(false);
        setUserEmail("");
		setUserId(null);
    }, []);

	const authSuccess = useCallback(() => {
        setIsLoggedIn(true);
        localStorage.setItem("isLoggedIn", "true");
        setUserEmail(localStorage.getItem("userEmail") || "");
        const storedId = localStorage.getItem("userId");
        if (storedId) setUserId(parseInt(storedId));
    }, []);

	return [userEmail, userId, isLoggedIn, logout, authSuccess] as const;
}
