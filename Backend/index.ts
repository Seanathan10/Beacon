import "dotenv/config";

import express, { Request, Response, NextFunction } from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import cors from "cors";
import * as OpenApiValidator from "express-openapi-validator";

import * as auth from "./routes/auth";
import * as pins from "./routes/pins";
import * as posts from "./routes/posts";
import * as comments from "./routes/comments";
import * as likes from "./routes/likes";
import * as trip from "./routes/trip";
import { shareRouter } from "./routes/share";

const app = express();
export { app };
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiSpec = path.join(__dirname, "./openapi.yml");

app.use(express.json());

// --- CORS (FIXED) ---
const allowedOrigins = new Set<string>([
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:4173",
    "https://ch2026.vercel.app",
    "https://www.beaconapp.live",
    "https://api.truthnuke.tech"
]);

const isAllowedOrigin = (origin: string) =>
    allowedOrigins.has(origin) ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);

app.use(
    cors({
        origin: (origin, cb) => {
            if (!origin) return cb(null, true);

            if (isAllowedOrigin(origin)) return cb(null, true);

            return cb(new Error(`CORS blocked for origin: ${origin}`), false);
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        // If you use cookies/sessions, set this true AND avoid "*" origins.
        credentials: false,
    }),
);

app.use((req, res, next) => {
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});


app.post("/api/trip/plan/stream", auth.check, trip.planTripStream);


app.use(
    OpenApiValidator.middleware({
        apiSpec,
        validateRequests: true,
        validateResponses: false,
    }),
);

app.get("/heartbeat", (req, res) => {
    console.log("[Server-side] Server received conn");
    res.json({
        status: "ok",
        timestamp: Date.now(),
    });
});

app.post("/api/login", auth.login);
app.post("/api/register", auth.register);

app.get("/api/pins", auth.check, pins.getAllPins);
app.get("/api/pins/user", auth.check, pins.getUserPins);
app.get("/api/pins/:id", auth.check, pins.getPin);
app.put("/api/pins/:id", auth.check, pins.updatePin);
app.post("/api/pins", auth.check, pins.createPin);
app.delete("/api/pins/:id", auth.check, pins.deletePin);

app.get("/api/posts", auth.check, posts.getAllPosts);
app.get("/api/posts/:id", auth.check, posts.getPost);
app.post("/api/posts", auth.check, posts.createPost);
app.put("/api/posts/:id", auth.check, posts.updatePost);
app.delete("/api/posts/:id", auth.check, posts.deletePost);
app.post("/api/posts/:id/upvote", auth.check, posts.upvotePost);

app.get("/api/pins/:pinId/comments", auth.check, comments.getPinComments);
app.post("/api/pins/:pinId/comments", auth.check, comments.createComment);
app.put("/api/comments/:commentId", auth.check, comments.updateComment);
app.delete("/api/comments/:commentId", auth.check, comments.deleteComment);

app.get("/api/likes/:id", auth.check, likes.getLikes);
app.post("/api/likes/:id", auth.check, likes.addLike);
app.delete("/api/likes/:id", auth.check, likes.removeLike);

app.post("/api/trip/plan", auth.check, trip.planTrip);
app.post("/api/trip/ask", auth.check, trip.askQuestion);
app.post("/api/trip/generate-itinerary", auth.check, trip.generateItineraryWithSelections);
app.post("/api/trip/local-route", auth.check, trip.getLocalRoute);
app.post("/api/trip/nearby-pins", auth.check, trip.getNearbyPinsForSelection);

// Share routes (public - no auth required for viewing shared itineraries)
app.use("/api/share", shareRouter);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
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
