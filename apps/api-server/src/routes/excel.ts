import { Router } from "express";
import { db, excelFilesTable, tasksTable, vehiclesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import * as XLSX from "xlsx";

const router = Router();

// GET /excel/download?date=YYYY-MM-DD
// Returns the stored Excel file with plate values written to the correct cells
router.get("/download", async (req, res) => {
  const date = req.query.date as string;
  if (!date) return res.status(400).json({ error: "date query param required (YYYY-MM-DD)" });

  const [file] = await db
    .select()
    .from(excelFilesTable)
    .where(eq(excelFilesTable.date, date));

  if (!file) return res.status(404).json({ error: "No Excel file stored for this date" });

  // Decode base64 → buffer → workbook
  const buf = Buffer.from(file.data, "base64");
  const wb = XLSX.read(buf, { type: "buffer", cellStyles: true, bookVBA: true });

  // Fetch tasks for this date that have vehicles assigned
  const dayStart = new Date(date);
  const dayEnd   = new Date(date);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const tasks = await db
    .select({
      rowIndex:  tasksTable.rowIndex,
      tableType: tasksTable.tableType,
      vehicleId: tasksTable.vehicleId,
      km:        tasksTable.km,
    })
    .from(tasksTable)
    .where(
      sql`${tasksTable.scheduledTime} >= ${dayStart} AND ${tasksTable.scheduledTime} < ${dayEnd}`
    );

  // Load vehicle plates
  const vehicleIds = [...new Set(tasks.map((t) => t.vehicleId).filter(Boolean))] as number[];
  const vehicleMap = new Map<number, string>();
  for (const id of vehicleIds) {
    const [v] = await db
      .select({ plate: vehiclesTable.plate })
      .from(vehiclesTable)
      .where(eq(vehiclesTable.id, id));
    if (v) vehicleMap.set(id, v.plate);
  }

  // Write plates and KM into sheet 1 (index 0) — first sheet is the main list
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (ws) {
    for (const task of tasks) {
      if (task.rowIndex == null) continue;
      const row = task.rowIndex; // 1-based Excel row

      if (task.tableType === "left") {
        // GELİR — left table: PLAKA = C, KM = G (col indices 2, 6)
        if (task.vehicleId) {
          const plate = vehicleMap.get(task.vehicleId) ?? "";
          ws[`C${row}`] = { v: plate, t: "s" };
        }
        if (task.km) {
          ws[`G${row}`] = { v: Number(task.km), t: "n" };
        }
      } else if (task.tableType === "right") {
        // GİDER — right table: PLAKA = I, KM = M (col indices 8, 12)
        if (task.vehicleId) {
          const plate = vehicleMap.get(task.vehicleId) ?? "";
          ws[`I${row}`] = { v: plate, t: "s" };
        }
        if (task.km) {
          ws[`M${row}`] = { v: Number(task.km), t: "n" };
        }
      }
    }
  }

  // Write back to buffer — preserve existing format
  const outBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="sevkiyat_${date}.xlsx"`);
  res.send(outBuf);
});

// GET /excel/has?date=YYYY-MM-DD
// Returns whether a file is stored for this date
router.get("/has", async (req, res) => {
  const date = req.query.date as string;
  if (!date) return res.status(400).json({ error: "date query param required" });
  const [file] = await db
    .select({ id: excelFilesTable.id, filename: excelFilesTable.filename, uploadedAt: excelFilesTable.uploadedAt })
    .from(excelFilesTable)
    .where(eq(excelFilesTable.date, date));
  return res.json({ exists: !!file, filename: file?.filename ?? null, uploadedAt: file?.uploadedAt ?? null });
});

export default router;
