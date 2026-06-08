import { Request } from "express";

/**
 * Log an error with request context (method, path, user, IP) so concurrent
 * errors in production are attributable to specific requests/users.
 */
export function logError(req: Request | undefined, context: string, err: unknown): void {
    const parts: string[] = [];
    if (req) {
        const userId = (req as any).user?.id ?? "anon";
        parts.push(`${req.method} ${req.originalUrl}`);
        parts.push(`user=${userId}`);
        parts.push(`ip=${req.ip ?? "unknown"}`);
    }
    const meta = parts.length > 0 ? ` [${parts.join(" ")}]` : "";
    console.error(`${context}${meta}:`, err);
}
