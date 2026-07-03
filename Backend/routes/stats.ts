import { Request, Response } from "express";
import * as statsRepo from "../repositories/statsRepo";

export function getUserStats(req: Request, res: Response) {
    res.json(statsRepo.getUserStats(req.user.id));
}

export function getUserActivity(req: Request, res: Response) {
    res.json(statsRepo.getRecentActivity(req.user.id));
}
