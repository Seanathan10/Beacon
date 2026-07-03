import { useState } from "react";
import { NavLink, useNavigate } from "react-router";
import * as authApi from "@/services/auth";
import { ApiError } from "@/lib/api";
import { track } from "@/utils/analytics";

export function LoginPage() {
    const navigate = useNavigate();
    const [credentials, setCredentials] = useState({
        email: "",
        password: "",
    });
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setCredentials({ ...credentials, [name]: value });
        if (error) setError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const data = await authApi.login(credentials.email, credentials.password);

            localStorage.setItem("isLoggedIn", "true");
            localStorage.setItem("userEmail", data.user?.email ?? credentials.email);
            if (data.user?.id) localStorage.setItem("userId", data.user.id.toString());

            track("Login");
            navigate("/home");
        } catch (err) {
            track("Login Failed");
            setError(
                err instanceof ApiError
                    ? (err.message || "Login failed")
                    : err instanceof Error
                        ? err.message
                        : "An error occurred during login",
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <h1>Login</h1>
            <form onSubmit={handleSubmit}>
                {error && (
                    <div style={{ color: "red", marginBottom: "1rem" }}>
                        {error}
                    </div>
                )}
                <div>
                    <label>Email:</label>
                    <input
                        type="email"
                        name="email"
                        value={credentials.email}
                        onChange={handleChange}
                        disabled={isLoading}
                        required
                    />
                </div>
                <div>
                    <label>Password:</label>
                    <input
                        type="password"
                        name="password"
                        value={credentials.password}
                        onChange={handleChange}
                        disabled={isLoading}
                        required
                    />
                </div>
                <button type="submit" disabled={isLoading}>
                    {isLoading ? "Logging in..." : "Login"}
                </button>

                <button type="button" disabled={isLoading}>
                    <nav>
                        <NavLink to="/home" end>
                            Skip login and go to Homepage
                        </NavLink>
                    </nav>
                </button>
            </form>
        </div>
    );
}
