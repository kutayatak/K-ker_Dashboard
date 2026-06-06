import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { db, routePresetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

  // Persist error to route_presets table so we can read it across Vercel container instances
  const errorData = {
    timestamp: new Date().toISOString(),
    message: err?.message ?? String(err),
    stack: err?.stack,
    code: err?.code,
    name: err?.name,
    status: statusCode,
    path: req.originalUrl || req.path,
    method: req.method,
    context: "global"
  };

  db.select()
    .from(routePresetsTable)
    .where(eq(routePresetsTable.pickupLocation, "__last_error_log__"))
    .limit(1)
    .then((existingList) => {
      const existing = existingList[0];
      if (existing) {
        return db
          .update(routePresetsTable)
          .set({
            dropoffLocation: JSON.stringify(errorData),
            km: "0.0"
          })
          .where(eq(routePresetsTable.id, existing.id));
      } else {
        return db
          .insert(routePresetsTable)
          .values({
            pickupLocation: "__last_error_log__",
            dropoffLocation: JSON.stringify(errorData),
            km: "0.0"
          });
      }
    })
    .catch((e) => {
      logger.error({ err: e }, "Failed to write error log to route_presets");
    });

  res.status(statusCode).json({
    error: {
      message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
}
