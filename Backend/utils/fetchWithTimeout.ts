/**
 * fetch() with a hard timeout that actually aborts the underlying request.
 *
 * Plain fetch() has no timeout: a hung upstream keeps the socket (and an Express
 * connection slot) open indefinitely. This wraps fetch with an AbortController so
 * the connection is torn down after `timeoutMs`. On timeout the returned promise
 * rejects with an AbortError, which callers already treat as a failed upstream.
 */
export async function fetchWithTimeout(
    input: string | URL,
    init: RequestInit = {},
    timeoutMs = 15_000,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}
