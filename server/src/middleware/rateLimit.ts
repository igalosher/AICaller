import type { Request, Response, NextFunction } from "express";

const hits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }
  if (entry.count >= MAX_REQUESTS) {
    res.status(429).json({ error: "יותר מדי בקשות, נסה שוב בעוד דקה" });
    return;
  }
  entry.count += 1;
  next();
}
