import type { Request, Response, NextFunction } from "express";

// ─── Simple in-memory rate limiter ────────────────────────────────────
// Requires `app.set("trust proxy", 1)` upstream so that req.ip reflects the
// real client IP from X-Forwarded-For instead of the reverse-proxy address.

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

// Cleanup old entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, 60_000);

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || "unknown";
    const key = `${opts.keyPrefix || "rl"}:${ip}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count++;

    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, opts.max - bucket.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > opts.max) {
      res.status(429).json({
        error: "rate_limit_exceeded",
        error_description: `Too many requests. Try again in ${Math.ceil((bucket.resetAt - now) / 1000)}s.`,
        retry_after: Math.ceil((bucket.resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}

// Pre-configured limiters
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 auth attempts per 15 min
  keyPrefix: "auth",
});

export const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 120,              // 120 MCP requests per minute
  keyPrefix: "mcp",
});

export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,                   // 10 registrations per hour
  keyPrefix: "reg",
});
