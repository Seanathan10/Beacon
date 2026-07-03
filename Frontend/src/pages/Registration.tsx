import { useState } from "react";
import { useNavigate } from "react-router";
import * as authApi from "@/services/auth";
import { ApiError } from "@/lib/api";
import { track } from "@/utils/analytics";

export function RegistrationPage() {
    const navigate = useNavigate();
    const [credentials, setCredentials] = useState({
        email: "",
        password: "",
        name: "",
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
            const data = await authApi.register({
                email: credentials.email,
                password: credentials.password,
                name: credentials.name || undefined,
            });

            localStorage.setItem("isLoggedIn", "true");
            localStorage.setItem("userEmail", data.user?.email ?? credentials.email);
            if (data.user?.id) localStorage.setItem("userId", data.user.id.toString());

            track("Register");
            navigate("/home");
        } catch (err) {
            track("Register Failed");
            setError(
                err instanceof ApiError
                    ? (err.message || "Registration failed")
                    : err instanceof Error
                        ? err.message
                        : "An error occurred during registration",
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <h1>Register for an account</h1>
            <form onSubmit={handleSubmit}>
                {error && <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>}
                <div>
                    <label>Name (optional):</label>
                    <input
                        type="text"
                        name="name"
                        value={credentials.name}
                        onChange={handleChange}
                        disabled={isLoading}
                    />
                </div>
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
                    {isLoading ? "Registering..." : "Register"}
                </button>
                <button type="button" onClick={() => navigate("/home")} disabled={isLoading}>
                    Skip and go to Homepage
                </button>
            </form>
        </div>
    );
}
