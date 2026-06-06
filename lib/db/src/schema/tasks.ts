import { pgTable, serial, text, integer, timestamp, numeric, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehiclesTable } from "./vehicles";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("hotel_pickup"), // "hotel_pickup" | "airport_run" | "extra"
  status: text("status").notNull().default("draft"), // "draft" | "assigned" | "in_progress" | "completed" | "cancelled"
  flightCode: text("flight_code"),
  passengerCount: integer("passenger_count").notNull().default(1),
  pickupLocation: text("pickup_location").notNull(),
  dropoffLocation: text("dropoff_location").notNull(),
  scheduledTime: timestamp("scheduled_time", { withTimezone: true }).notNull(),
  actualPickupTime: timestamp("actual_pickup_time", { withTimezone: true }),
  actualDropoffTime: timestamp("actual_dropoff_time", { withTimezone: true }),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id, { onDelete: "set null" }),
  notes: text("notes"),
  fee: numeric("fee", { precision: 10, scale: 2 }),
  km: numeric("km", { precision: 8, scale: 1 }),           // KM for this route
  importKey: text("import_key"),                            // deduplication key (nullable for manually-created tasks)
  rowIndex: integer("row_index"),                           // Excel row index (for plate write-back)
  tableType: text("table_type"),                            // "left" | "right" (Excel table side)
  shiftDate: text("shift_date"),                            // "YYYY-MM-DD" — the original Excel import date (ignores dateOffset midnight crossings)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tasks_import_key_idx").on(t.importKey),
  index("tasks_scheduled_time_idx").on(t.scheduledTime),
  index("tasks_status_idx").on(t.status),
  index("tasks_shift_date_idx").on(t.shiftDate),
  index("tasks_vehicle_id_idx").on(t.vehicleId),
  index("tasks_shift_date_status_idx").on(t.shiftDate, t.status)
]);

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;

