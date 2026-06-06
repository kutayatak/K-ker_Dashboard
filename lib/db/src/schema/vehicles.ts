import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vehiclesTable = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  plate: text("plate").notNull().unique(),
  type: text("type").notNull().default("fixed"), // "fixed" | "outsource"
  status: text("status").notNull().default("empty"), // "empty" | "busy" | "offline"
  driverName: text("driver_name").notNull(),
  phone: text("phone").notNull(),
  capacity: integer("capacity").default(4),
  queuePosition: integer("queue_position"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("vehicles_status_type_idx").on(t.status, t.type),
  index("vehicles_queue_position_idx").on(t.queuePosition),
]);

export const insertVehicleSchema = createInsertSchema(vehiclesTable).omit({ id: true, createdAt: true });
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehiclesTable.$inferSelect;
