import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import * as userRepo from "../repositories/userRepo";

const COOKIE_OPTIONS = {
    httpOnly: true,
    // Always set Secure outside tests. Modern browsers treat http://localhost as a
    // secure context, so cookie-based auth still works in local dev; this prevents
    // the cookie from ever traversing plain HTTP on a shared/staging network.
    secure: process.env.NODE_ENV !== "test",
    sameSite: "strict" as const,
    maxAge: 60 * 60 * 1000,
    path: "/",
};

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt truncates beyond 72 bytes
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SessionUser {
    id: number;
}

/**
 * In-memory JWT denylist. On logout we record the token's jti/raw value until its
 * natural expiry so a captured Bearer token cannot be replayed after logout.
 * Keyed by the raw token string → expiry (ms epoch).
 */
const tokenDenylist = new Map<string, number>();

function extractToken(req: Request): string | null {
    let token: string | null = req.cookies?.accessToken ?? null;
    if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && typeof authHeader === "string") {
            const parts = authHeader.split(" ");
            if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1].length > 0) {
                token = parts[1];
            }
        }
    }
    return token;
}

function isDenylisted(token: string): boolean {
    const exp = tokenDenylist.get(token);
    if (exp === undefined) return false;
    if (Date.now() > exp) {
        tokenDenylist.delete(token);
        return false;
    }
    return true;
}

// Periodically purge expired denylist entries so the map cannot grow unbounded.
if (process.env.NODE_ENV !== "test") {
    setInterval(() => {
        const now = Date.now();
        for (const [token, exp] of tokenDenylist.entries()) {
            if (now > exp) tokenDenylist.delete(token);
        }
    }, 10 * 60 * 1000).unref?.();
}

export function clearTokenDenylistForTesting() {
    tokenDenylist.clear();
}

export interface User {
    id: number;
    username: string;
}

export async function login(req: Request, res: Response) {
    const { email, password } = req.body;

    const user = userRepo.findByEmailWithPassword(email);

    if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    const accessToken = jwt.sign(
        { id: user.id },
        process.env.SECRET as string,
        {
            expiresIn: "1h",
            algorithm: "HS256",
        },
    );

    res.cookie("accessToken", accessToken, COOKIE_OPTIONS);
    res.status(200).json({
        accessToken,
        user: { id: user.id, name: user.name, email: user.email },
    });
}

export async function register(req: Request, res: Response) {
    const { email, password, name } = req.body;

    // Application-layer validation (defense in depth alongside the OpenAPI spec).
    if (typeof email !== "string" || !EMAIL_RE.test(email) || email.length > 254) {
        return res.status(400).json({ message: "A valid email is required" });
    }
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` });
    }

    // Check if user already exists
    if (userRepo.existsByEmail(email)) {
        return res.status(409).json({ message: "Email already registered" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const id = userRepo.createAccount(email, hashedPassword, name || null);

        const accessToken = jwt.sign({ id }, process.env.SECRET as string, {
            expiresIn: "1h",
            algorithm: "HS256",
        });

        res.cookie("accessToken", accessToken, COOKIE_OPTIONS);
        res.status(201).json({
            accessToken,
            user: { id, name: name || null, email },
        });
    } catch {
        res.status(500).json({ message: "Registration failed" });
    }
}

export function check(req: Request, res: Response, next: NextFunction) {
    const token = extractToken(req);

    if (!token) {
        return res.status(401).json({ message: "No token provided" });
    }

    if (isDenylisted(token)) {
        return res.status(401).json({ message: "Invalid token" });
    }

    jwt.verify(token, process.env.SECRET as string, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: "Invalid token" });
        }
        req.user = decoded as SessionUser;
        next();
    });
}

export function optional(req: Request, _res: Response, next: NextFunction) {
    const token = extractToken(req);

    if (!token || isDenylisted(token)) return next();

    jwt.verify(token, process.env.SECRET as string, (err, decoded) => {
        if (!err) req.user = decoded as SessionUser;
        next();
    });
}

export function logout(req: Request, res: Response) {
    // Denylist the presented token until its natural expiry so it cannot be
    // replayed (e.g. via the Authorization header) after logout.
    const token = extractToken(req);
    if (token) {
        const decoded = jwt.decode(token) as { exp?: number } | null;
        const expMs = decoded?.exp ? decoded.exp * 1000 : Date.now() + COOKIE_OPTIONS.maxAge;
        tokenDenylist.set(token, expMs);
    }
    res.clearCookie("accessToken", { ...COOKIE_OPTIONS, maxAge: 0 });
    res.status(200).json({ message: "Logged out" });
}
