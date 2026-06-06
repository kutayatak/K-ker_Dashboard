import type { Request, Response, NextFunction } from "express";

export function apiKeyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.originalUrl || req.path;
  // Skip authentication for health check and webhook endpoints
  if (path.includes("/healthz") || path.includes("/webhook")) {
    next();
    return;
  }

  const apiKey = req.headers["x-api-key"];
  const secretKey = process.env.API_SECRET_KEY || "dev-secret-key-123";

  if (!apiKey || apiKey !== secretKey) {
    res.status(401).json({
      error: {
        message: "Unauthorized. Missing or invalid API key.",
      },
    });
    return;
  }

  next();
}
