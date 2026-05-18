import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const excelFilesTable = pgTable("excel_files", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),       // "YYYY-MM-DD" — one file per day
  filename: text("filename").notNull(),
  data: text("data").notNull(),                // base64-encoded Excel binary
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});
