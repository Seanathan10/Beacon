import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import * as db from "../database/db";

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 1000,
    path: "/",
};

// Use the type defined in types/express/index.d.ts or redefine locally if not automatically picked up
// To be safe and avoid compilation/test errors, we can use the specific type or any temporarily, 
// but let's try to do it right. The types should be picked up if tsconfig is correct.
// However, since we are in a 'commonjs' style migration chaos, let's just use 'any' cast if the global isn't found
// OR explicitly define it here to mirror the global one for safety.

interface SessionUser {
    id: string; // or number, depends on your DB implementation. sqlite integer -> number usually, but jsonwebtoken might return string in some configs?
    // Looking at login, it signs { id: user.id }
}

export interface User {
    id: string;
    username: string;
}

export async function login(req: Request, res: Response) {
    const { email, password } = req.body;

    const user: any = db.query(
        `SELECT id, email, name, password FROM account WHERE email = ?`,
        [email],
    )[0];

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
        user: { id: user.id, name: user.name, email: user.email },
    });
}

export async function register(req: Request, res: Response) {
    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = db.query(`SELECT id FROM account WHERE email = ?`, [
        email,
    ])[0];

    if (existingUser) {
        return res.status(409).json({ message: "Email already registered" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.query(
            `INSERT INTO account (email, password, name) VALUES (?, ?, ?)`,
            [email, hashedPassword, name || null],
        );

        const [{ id }] = db.query(`SELECT last_insert_rowid() as id`);

        const accessToken = jwt.sign({ id }, process.env.SECRET as string, {
            expiresIn: "1h",
            algorithm: "HS256",
        });

        res.cookie("accessToken", accessToken, COOKIE_OPTIONS);
        res.status(201).json({
            user: { id, name: name || null, email },
        });
    } catch (err) {
        res.status(500).json({ message: "Registration failed" });
    }
}

export function check(req: Request, res: Response, next: NextFunction) {
    let token: string | null = req.cookies?.accessToken ?? null;

    if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader) {
            const parts = authHeader.split(" ");
            token = parts.length === 2 && parts[0].toLowerCase() === "bearer" ? parts[1] : null;
        }
    }

    if (!token) {
        return res.status(401).json({ message: "No token provided" });
    }

    jwt.verify(token, process.env.SECRET as string, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: "Invalid token" });
        }
        req.user = decoded as SessionUser;
        next();
    });
}

export function logout(_req: Request, res: Response) {
    res.clearCookie("accessToken", { ...COOKIE_OPTIONS, maxAge: 0 });
    res.status(200).json({ message: "Logged out" });
}
