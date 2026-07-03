import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";

function Probe() {
    const { isLoggedIn, userId, userEmail, logout } = useAuth();
    return (
        <div>
            <span data-testid="loggedIn">{String(isLoggedIn)}</span>
            <span data-testid="userId">{String(userId)}</span>
            <span data-testid="email">{userEmail}</span>
            <button onClick={logout}>logout</button>
        </div>
    );
}

beforeEach(() => {
    localStorage.clear();
    // logout() fires a best-effort fetch to /api/logout; stub it so tests never
    // hit the network.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
});

describe("AuthContext", () => {
    it("reads initial auth state from localStorage", () => {
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("userId", "42");
        localStorage.setItem("userEmail", "a@b.com");

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>,
        );

        expect(screen.getByTestId("loggedIn").textContent).toBe("true");
        expect(screen.getByTestId("userId").textContent).toBe("42");
        expect(screen.getByTestId("email").textContent).toBe("a@b.com");
    });

    it("defaults to logged-out when localStorage is empty", () => {
        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>,
        );
        expect(screen.getByTestId("loggedIn").textContent).toBe("false");
        expect(screen.getByTestId("userId").textContent).toBe("null");
    });

    it("logout clears state and the localStorage auth keys", () => {
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("userId", "42");
        localStorage.setItem("userEmail", "a@b.com");

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>,
        );
        act(() => {
            screen.getByText("logout").click();
        });

        expect(screen.getByTestId("loggedIn").textContent).toBe("false");
        expect(localStorage.getItem("isLoggedIn")).toBeNull();
        expect(localStorage.getItem("userId")).toBeNull();
    });
});
