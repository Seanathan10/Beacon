import { Request, Response } from "express";
import * as searchRepo from "../repositories/searchRepo";
import { stripHtml } from "../utils/sanitize";

const MAX_QUERY_LENGTH = 200;
const MAX_HISTORY_PER_USER = 50;
const DEFAULT_CONTENT_LIMIT = 5;
const MAX_CONTENT_LIMIT = 20;

function parseContentSearch(req: Request): { query: string; like: string; prefix: string; limit: number } | null {
    const raw = req.query.q;
    if (typeof raw !== "string" || !raw.trim()) return null;

    const query = stripHtml(raw.trim()).slice(0, MAX_QUERY_LENGTH);
    if (!query) return null;

    const rawLimit = parseInt(String(req.query.limit ?? DEFAULT_CONTENT_LIMIT), 10);
    const limit = isNaN(rawLimit)
        ? DEFAULT_CONTENT_LIMIT
        : Math.min(Math.max(rawLimit, 1), MAX_CONTENT_LIMIT);

    return {
        query,
        like: `%${query}%`,
        prefix: `${query}%`,
        limit,
    };
}

export function searchContent(req: Request, res: Response) {
    const parsed = parseContentSearch(req);
    if (!parsed) {
        return res.status(400).json({ error: "Query is required" });
    }

    const userID = req.user?.id ?? null;
    const searchParams = { userID, prefix: parsed.prefix, like: parsed.like, limit: parsed.limit };

    const pins = searchRepo.searchPins(searchParams);
    const posts = searchRepo.searchPosts(searchParams).map((post: any) => ({
        ...post,
        tags: post.tags ? post.tags.split(',').map((t: string) => t.trim()) : [],
    }));

    res.json({
        query: parsed.query,
        pins,
        posts,
    });
}

export function getSearchHistory(req: Request, res: Response) {
    res.json(searchRepo.getHistory(req.user.id));
}

export function addSearchHistory(req: Request, res: Response) {
    const userID = req.user.id;
    const raw = req.body?.query;

    if (typeof raw !== "string" || !raw.trim()) {
        return res.status(400).json({ error: "Query is required" });
    }

    const query = stripHtml(raw.trim()).slice(0, MAX_QUERY_LENGTH);
    if (!query) {
        return res.status(400).json({ error: "Query is required" });
    }

    // De-dupe: remove an existing identical query so the new one is the freshest.
    searchRepo.deleteHistoryByQuery(userID, query);
    searchRepo.insertHistory(userID, query);
    // Enforce retention cap: keep only the latest MAX_HISTORY_PER_USER per user.
    searchRepo.trimHistory(userID, MAX_HISTORY_PER_USER);

    res.status(201).json(searchRepo.findLatestByQuery(userID, query));
}

export function deleteSearchHistoryEntry(req: Request, res: Response) {
    const userID = req.user.id;
    const entryID = parseInt(String(req.params.id), 10);

    if (isNaN(entryID)) {
        return res.status(400).json({ error: "Invalid history id" });
    }

    const result = searchRepo.deleteHistoryEntry(entryID, userID);

    if (!result.changes) {
        return res.status(404).json({ message: "Entry not found" });
    }

    res.status(204).send();
}

export function clearSearchHistory(req: Request, res: Response) {
    searchRepo.clearHistory(req.user.id);
    res.status(204).send();
}
