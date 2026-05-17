import { pgTable, serial, integer, text, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountingTable = pgTable("accounting", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull(),
  taskId: integer("task_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: date("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAccountingSchema = createInsertSchema(accountingTable).omit({ id: true, createdAt: true });
export type InsertAccounting = z.infer<typeof insertAccountingSchema>;
export type Accounting = typeof accountingTable.$inferSelect;
