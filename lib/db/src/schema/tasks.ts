import { pgTable, serial, text, integer, timestamp, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("hotel_pickup"), // "hotel_pickup" | "airport_run" | "extra"
  status: text("status").notNull().default("draft"), // "draft" | "assigned" | "in_progress" | "completed" | "cancelled"
  flightCode: text("flight_code"),
  passengerCount: integer("passenger_count").notNull().default(1),
  pickupLocation: text("pickup_location").notNull(),
  dropoffLocation: text("dropoff_location").notNull(),
  scheduledTime: timestamp("scheduled_time").notNull(),
  actualPickupTime: timestamp("actual_pickup_time"),
  actualDropoffTime: timestamp("actual_dropoff_time"),
  vehicleId: integer("vehicle_id"),
  notes: text("notes"),
  fee: numeric("fee", { precision: 10, scale: 2 }),
  km: numeric("km", { precision: 8, scale: 1 }),           // KM for this route
  importKey: text("import_key"),                            // deduplication key (nullable for manually-created tasks)
  rowIndex: integer("row_index"),                           // Excel row index (for plate write-back)
  tableType: text("table_type"),                            // "left" | "right" (Excel table side)
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("tasks_import_key_idx").on(t.importKey)]);

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;

