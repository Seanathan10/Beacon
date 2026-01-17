import { Request, Response } from "express";
import jwt from 'jsonwebtoken';
import * as db from '../database/db.ts';

export interface User {
    id: string;
    username: string;
}

export async function login(req: Request, res: Response) {
    const { email, password } = req.body;

    const user: User = db.query(
        `SELECT id, email, name FROM account WHERE email = ? AND password = ?`,
        [email, password]
    )[0];

    if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    const accessToken = jwt.sign(
        { id: user.id },
        process.env.SECRET as string,
        {
            expiresIn: '1h',
            algorithm: 'HS256',
        }
    );

    res.status(200).json({ accessToken: accessToken });
}

export async function register(req: Request, res: Response) {
    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = db.query(
        `SELECT id FROM account WHERE email = ?`,
        [email]
    )[0];

    if (existingUser) {
        return res.status(409).json({ message: 'Email already registered' });
    }

    try {
        const result = db.run(
            `INSERT INTO account (email, password, name) VALUES (?, ?, ?)`,
            [email, password, name || null]
        );

        const accessToken = jwt.sign(
            { id: result.lastInsertRowid },
            process.env.SECRET as string,
            {
                expiresIn: '1h',
                algorithm: 'HS256',
            }
        );

        res.status(201).json({ accessToken: accessToken });
    } catch (err) {
        res.status(500).json({ message: 'Registration failed' });
    }
}