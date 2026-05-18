import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Preset KM values for fixed routes
export const routePresetsTable = pgTable("route_presets", {
  id: serial("id").primaryKey(),
  pickupLocation: text("pickup_location").notNull(),
  dropoffLocation: text("dropoff_location").notNull(),
  km: numeric("km", { precision: 8, scale: 1 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRoutePresetSchema = createInsertSchema(routePresetsTable).omit({ id: true, createdAt: true });
export type InsertRoutePreset = z.infer<typeof insertRoutePresetSchema>;
export type RoutePreset = typeof routePresetsTable.$inferSelect;
