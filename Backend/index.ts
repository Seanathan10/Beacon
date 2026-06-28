import "dotenv/config";

import express, { Request, Response, NextFunction } from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import * as OpenApiValidator from "express-openapi-validator";

import * as auth from "./routes/auth.ts";
import * as pins from "./routes/pins.ts";
import * as posts from "./routes/posts.ts";
import * as comments from "./routes/comments.ts";
import * as likes from "./routes/likes.ts";
import * as trip from "./routes/trip.ts";
import * as pinStatus from "./routes/pinStatus.ts";
import * as search from "./routes/search.ts";
import * as bookmarks from "./routes/bookmarks.ts";
import * as stats from "./routes/stats.ts";
import * as users from "./routes/users.ts";
import * as follows from "./routes/follows.ts";
import * as notifications from "./routes/notifications.ts";
import * as trips from "./routes/trips.ts";
import { shareRouter } from "./routes/share.ts";
import * as plausible from "./routes/plausible.ts";

const REQUIRED_ENV_VARS = ["SECRET"];
const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
}

const app = express();
export { app };
const PORT = parseInt(process.env.PORT || "3000", 10);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiSpec = path.join(__dirname, "./openapi.yml");

app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Hard cap on distinct keys so an attacker rotating IPs cannot grow the map
// without bound between cleanup sweeps and exhaust process memory.
const MAX_RATE_LIMIT_ENTRIES = 50_000;

function rateLimiter(maxRequests: number, windowMs: number, keyFn?: (req: Request) => string) {
    return (req: Request, res: Response, next: NextFunction) => {
        const key = keyFn
            ? keyFn(req)
            : (req.ip || req.socket.remoteAddress || "unknown");
        const now = Date.now();

        const entry = rateLimitStore.get(key);

        if (!entry || now > entry.resetAt) {
            // Bound the store: a new key would be added. If we're at capacity,
            // first evict expired entries; if still full, fail closed.
            if (!entry && rateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES) {
                for (const [k, e] of rateLimitStore.entries()) {
                    if (now > e.resetAt) rateLimitStore.delete(k);
                }
                if (rateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES) {
                    res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
                    return res.status(429).json({ message: "Server busy, please try again later" });
                }
            }
            rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        if (entry.count >= maxRequests) {
            res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
            return res.status(429).json({ message: "Too many requests, please try again later" });
        }

        entry.count++;
        next();
    };
}

const authRateLimit = rateLimiter(10, 15 * 60 * 1000); // 10 per 15 min per IP

const tripRateLimit = rateLimiter(20, 60 * 1000, (req) => `trip:${req.user?.id ?? req.ip}`);

const shareRateLimit = rateLimiter(100, 60 * 1000, (req) => `share:${req.ip}`); // 100 per minute per IP

// General write limiter for content-mutating endpoints (pins, posts, comments,
// likes, bookmarks, follows, etc.) so an authenticated user cannot flood the DB
// with unlimited writes. Keyed per user (falls back to IP if unauthenticated).
const writeRateLimit = rateLimiter(120, 60 * 1000, (req) => `write:${req.user?.id ?? req.ip}`);

if (process.env.NODE_ENV !== "test") {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of rateLimitStore.entries()) {
            if (now > entry.resetAt) rateLimitStore.delete(key);
        }
    }, 10 * 60 * 1000);
}

export function clearRateLimitStoreForTesting() {
    rateLimitStore.clear();
}

const allowedOrigins = new Set<string>([
    "http://localhost:3000",
    "http://localhost:5173",
    "https://ch2026.vercel.app",
    "https://www.beaconapp.live",
    "https://beaconapp.live",
    "https://api.beaconapp.live"
]);

app.use(
    cors({
        origin: (origin, cb) => {
            if (!origin) return cb(null, true);
            if (allowedOrigins.has(origin)) return cb(null, true);
            return cb(null, false);
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    }),
);

app.use((req, res, next) => {
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

// CSRF defense-in-depth: for state-changing requests, reject any browser-issued
// cross-origin request. Browsers always send `Origin` on cross-site writes, so a
// forged form/XHR from an attacker's page is blocked server-side even though the
// auth cookie is SameSite=strict. Same-origin and non-browser clients (no Origin
// header, e.g. server-to-server or the test runner) are unaffected.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
app.use((req, res, next) => {
    if (MUTATING_METHODS.has(req.method)) {
        const origin = req.headers.origin;
        if (origin && !allowedOrigins.has(origin)) {
            return res.status(403).json({ message: "Cross-origin request blocked" });
        }
    }
    next();
});

// Plausible proxy routes must be registered before OpenAPI validator,
// which rejects paths not defined in the spec.
app.get("/metrics/js/script.js", plausible.proxyScript);
app.post("/metrics/event", express.text({ type: "*/*" }), plausible.proxyEvent);

app.use(
    OpenApiValidator.middleware({
        apiSpec,
        validateRequests: true,
        validateResponses: false,
    }),
);

app.get("/heartbeat", (req, res) => {
    res.json({
        status: "ok",
        timestamp: Date.now(),
    });
});

app.post("/api/login", authRateLimit, auth.login);
app.post("/api/register", authRateLimit, auth.register);
app.post("/api/logout", auth.logout);

app.get("/api/pins", auth.check, pins.getAllPins);
app.get("/api/pins/trending", auth.check, pins.getTrendingPins);
app.get("/api/pins/user", auth.check, pins.getUserPins);
app.post("/api/pins/nearby", auth.check, pins.getPinsNearCoordinate);
app.get("/api/pins/:id/similar", auth.check, pins.getSimilarPins);
app.get("/api/pins/:id", auth.check, pins.getPin);
app.put("/api/pins/:id", auth.check, writeRateLimit, pins.updatePin);
app.post("/api/pins", auth.check, writeRateLimit, pins.createPin);
app.delete("/api/pins/:id", auth.check, writeRateLimit, pins.deletePin);

app.get("/api/posts", auth.check, posts.getAllPosts);
app.get("/api/posts/nearby", auth.check, posts.getNearbyPosts);
app.get("/api/posts/:id", auth.check, posts.getPost);
app.post("/api/posts", auth.check, writeRateLimit, posts.createPost);
app.put("/api/posts/:id", auth.check, writeRateLimit, posts.updatePost);
app.delete("/api/posts/:id", auth.check, writeRateLimit, posts.deletePost);
app.post("/api/posts/:id/upvote", auth.check, writeRateLimit, posts.upvotePost);

app.get("/api/pins/:pinId/comments", auth.check, comments.getPinComments);
app.post("/api/pins/:pinId/comments", auth.check, writeRateLimit, comments.createComment);
app.put("/api/comments/:commentId", auth.check, writeRateLimit, comments.updateComment);
app.delete("/api/comments/:commentId", auth.check, writeRateLimit, comments.deleteComment);
app.post("/api/comments/:id/reactions", auth.check, writeRateLimit, comments.addCommentReaction);
app.delete("/api/comments/:id/reactions/:emoji", auth.check, writeRateLimit, comments.removeCommentReaction);

app.get("/api/likes/user", auth.check, likes.getLikedPins);
app.get("/api/likes/:id", auth.check, likes.getLikes);
app.post("/api/likes/:id", auth.check, writeRateLimit, likes.addLike);
app.delete("/api/likes/:id", auth.check, writeRateLimit, likes.removeLike);

app.get("/api/pin-status", auth.check, pinStatus.getUserPinStatuses);
app.put("/api/pins/:id/status", auth.check, writeRateLimit, pinStatus.setPinStatus);
app.delete("/api/pins/:id/status", auth.check, writeRateLimit, pinStatus.deletePinStatus);

app.get("/api/search", auth.check, search.searchContent);
app.get("/api/search/history", auth.check, search.getSearchHistory);
app.post("/api/search/history", auth.check, search.addSearchHistory);
app.delete("/api/search/history/:id", auth.check, search.deleteSearchHistoryEntry);
app.delete("/api/search/history", auth.check, search.clearSearchHistory);

app.post("/api/trip/plan", auth.check, tripRateLimit, trip.planTrip);
app.post("/api/trip/plan/stream", auth.check, tripRateLimit, trip.planTripStream);
app.post("/api/trip/ask", auth.check, tripRateLimit, trip.askQuestion);
app.post("/api/trip/generate-itinerary", auth.check, tripRateLimit, trip.generateItineraryWithSelections);
app.post("/api/trip/local-route", auth.check, tripRateLimit, trip.getLocalRoute);
app.post("/api/trip/nearby-pins", auth.check, tripRateLimit, trip.getNearbyPinsForSelection);
app.post("/api/trip/save", auth.check, writeRateLimit, trips.saveTrip);

// auth.optional populates req.user when a token is present so a published
// itinerary is associated with its creator (and shows up in their My Trips),
// while still allowing anonymous shares.
app.use("/api/share", shareRateLimit, auth.optional, shareRouter);

app.get("/api/bookmarks", auth.check, bookmarks.getBookmarks);
app.post("/api/bookmarks", auth.check, writeRateLimit, bookmarks.addBookmark);
app.delete("/api/bookmarks/:pinID", auth.check, writeRateLimit, bookmarks.deleteBookmark);
app.patch("/api/bookmarks/:pinID", auth.check, writeRateLimit, bookmarks.updateBookmark);

app.get("/api/bookmarks/folders", auth.check, bookmarks.getFolders);
app.post("/api/bookmarks/folders", auth.check, writeRateLimit, bookmarks.createFolder);
app.patch("/api/bookmarks/folders/:id", auth.check, writeRateLimit, bookmarks.updateFolder);
app.delete("/api/bookmarks/folders/:id", auth.check, writeRateLimit, bookmarks.deleteFolder);

app.get("/api/me/trips", auth.check, trips.getMyTrips);
app.get("/api/me/trips/:id", auth.check, trips.getMyTrip);
app.get("/api/me/carbon-stats", auth.check, trips.getCarbonStats);

app.get("/api/me/stats", auth.check, stats.getUserStats);
app.get("/api/me/activity", auth.check, stats.getUserActivity);
app.patch("/api/me", auth.check, writeRateLimit, users.updateMe);

app.get("/api/users/:userID", auth.optional, users.getUser);
app.get("/api/users/:userID/pins", auth.optional, users.getUserPins);
app.get("/api/users/:userID/followers", auth.optional, users.getUserFollowers);
app.get("/api/users/:userID/following", auth.optional, users.getUserFollowing);
app.post("/api/users/:userID/follow", auth.check, writeRateLimit, follows.followUser);
app.delete("/api/users/:userID/follow", auth.check, writeRateLimit, follows.unfollowUser);
app.get("/api/me/feed", auth.check, follows.getFollowFeed);

app.get("/api/notifications", auth.check, notifications.getNotifications);
app.get("/api/notifications/unread-count", auth.check, notifications.getUnreadCount);
app.post("/api/notifications/read", auth.check, writeRateLimit, notifications.markRead);

app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'cors') {
        return res.status(403).json({ message: "Forbidden" });
    }

    if (err.status) {
        return res.status(err.status).json({
            message: err.message,
            errors: err.errors,
            error: err.message
        });
    }

    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ message: "Unauthorized" });
    }

    console.error("Unhandled Error:", err);
    res.status(500).json({
        message: "Internal Server Error",
        error: process.env.NODE_ENV === 'test' ? err.message : undefined
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend listening on http://0.0.0.0:${PORT}`);
});
