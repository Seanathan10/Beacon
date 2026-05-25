import { Request, Response } from "express";

const PLAUSIBLE_BASE = "https://analytics.byseansingh.com";
const SCRIPT_URL = `${PLAUSIBLE_BASE}/js/script.js`;
const EVENT_URL = `${PLAUSIBLE_BASE}/api/event`;

export async function proxyScript(_req: Request, res: Response) {
    const upstream = await fetch(SCRIPT_URL);
    const body = await upstream.text();
    res.setHeader("Content-Type", "text/javascript");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(body);
}

export async function proxyEvent(req: Request, res: Response) {
    const upstream = await fetch(EVENT_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": req.headers["user-agent"] ?? "",
            "X-Forwarded-For": req.ip ?? "",
        },
        body: JSON.stringify(req.body),
    });
    res.status(upstream.status).end();
}
