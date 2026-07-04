import { BASE_API_URL } from "../../constants";

/**
 * Thrown by the API client for any non-2xx response. Carries the HTTP status
 * (so callers can special-case 401, 404, etc.) and the parsed error body.
 */
export class ApiError extends Error {
    status: number;
    body: unknown;

    constructor(status: number, message: string, body?: unknown) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.body = body;
    }
}

type Json = Record<string, unknown> | unknown[] | null;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const isJsonBody = options.body !== undefined && !(options.body instanceof FormData);

    const res = await fetch(`${BASE_API_URL}${path}`, {
        credentials: "include",
        ...options,
        headers: {
            ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
        },
    });

    if (!res.ok) {
        let body: unknown;
        try {
            body = await res.json();
        } catch {
            body = undefined;
        }
        const message =
            (body && typeof body === "object" && "message" in body && typeof body.message === "string"
                ? body.message
                : undefined) ?? res.statusText;
        throw new ApiError(res.status, message, body);
    }

    // 204 No Content (e.g. DELETE) or an empty body.
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Single entry point for talking to the Beacon backend. Sets the base URL and
 * `credentials: "include"` (cookie auth), serialises JSON bodies, and
 * normalises errors into {@link ApiError}. Prefer this over calling `fetch`
 * directly so auth, error handling and the base URL stay in one place.
 */
export const api = {
    get: <T>(path: string, options?: RequestInit) => request<T>(path, options),
    post: <T>(path: string, data?: Json, options?: RequestInit) =>
        request<T>(path, { ...options, method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
    put: <T>(path: string, data?: Json, options?: RequestInit) =>
        request<T>(path, { ...options, method: "PUT", body: data !== undefined ? JSON.stringify(data) : undefined }),
    patch: <T>(path: string, data?: Json, options?: RequestInit) =>
        request<T>(path, { ...options, method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined }),
    delete: <T>(path: string, options?: RequestInit) => request<T>(path, { ...options, method: "DELETE" }),
};
