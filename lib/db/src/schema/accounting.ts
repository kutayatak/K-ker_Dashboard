import { pgTable, serial, integer, text, numeric, date, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehiclesTable } from "./vehicles";
import { tasksTable } from "./tasks";

export const accountingTable = pgTable("accounting", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull().references(() => vehiclesTable.id, { onDelete: "cascade" }),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: date("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("accounting_vehicle_id_idx").on(t.vehicleId),
  index("accounting_task_id_idx").on(t.taskId),
]);

export const insertAccountingSchema = createInsertSchema(accountingTable).omit({ id: true, createdAt: true });
export type InsertAccounting = z.infer<typeof insertAccountingSchema>;
export type Accounting = typeof accountingTable.$inferSelect;
