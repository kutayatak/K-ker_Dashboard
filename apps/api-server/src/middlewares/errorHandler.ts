import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logger.error({ err, req }, "Global error handler caught an error");

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  // Store in global memory for production diagnostics
  (globalThis as any).lastGlobalError = {
    timestamp: new Date().toISOString(),
    message: err?.message ?? String(err),
    stack: err?.stack,
    name: err?.name,
    code: err?.code,
    status: statusCode,
    path: req.originalUrl || req.path,
    method: req.method
  };

  res.status(statusCode).json({
    error: {
      message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
}
