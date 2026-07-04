import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { BASE_API_URL } from "../../constants";

export interface AuthState {
    userEmail: string;
    userId: number | null;
    isLoggedIn: boolean;
    /** Log out: clears the cookie server-side and the local auth state. */
    logout: () => void;
    /** Call after a successful login/register to sync state from localStorage. */
    authSuccess: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Owns the authentication state and is the single reader/writer of the
 * `isLoggedIn` / `userEmail` / `userId` localStorage keys. Wrap the app in this
 * provider and read state via {@link useAuth} instead of touching localStorage
 * directly. Replaces the old positional-tuple `AuthHook`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
    const [userEmail, setUserEmail] = useState<string>(() => localStorage.getItem("userEmail") || "");

    const [userId, setUserId] = useState<number | null>(() => {
        const id = localStorage.getItem("userId");
        return id ? parseInt(id) : null;
    });

    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => localStorage.getItem("isLoggedIn") === "true");

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

    return (
        <AuthContext.Provider value={{ userEmail, userId, isLoggedIn, logout, authSuccess }}>
            {children}
        </AuthContext.Provider>
    );
}

/** Read the current auth state. Must be used within an {@link AuthProvider}. */
export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
    return ctx;
}
