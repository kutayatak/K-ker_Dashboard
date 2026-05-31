import { Router } from "express";
import { db, excelFilesTable, tasksTable, vehiclesTable } from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";

const router = Router();

// Helper to convert YYYY-MM-DD to DDMMYY
const formatToDDMMYY = (dateStr: string): string => {
  if (!dateStr || !dateStr.includes("-")) return dateStr;
  const [y, m, d] = dateStr.split("-");
  return `${d}${m}${y.slice(2)}`;
};

// GET /excel/download?date=YYYY-MM-DD
// Returns the stored Excel file with plate values written to the correct cells
router.get("/download", async (req: any, res: any) => {
  const date = req.query.date as string;
  if (!date) return res.status(400).json({ error: "date query param required (YYYY-MM-DD)" });

  const dmy = formatToDDMMYY(date);

  const [file] = await db
    .select()
    .from(excelFilesTable)
    .where(sql`${excelFilesTable.date} = ${date} OR ${excelFilesTable.date} = ${dmy}`);

  if (!file) return res.status(404).json({ error: "No Excel file stored for this date" });

  // Decode base64 → buffer → workbook
  const buf = Buffer.from(file.data, "base64");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);

  const [y, m, d] = date.split("-").map(Number);
  const shiftStart = new Date(Date.UTC(y, m - 1, d, 6, 0, 0, 0));
  const shiftEnd = new Date(Date.UTC(y, m - 1, d + 1, 6, 0, 0, 0));

  const tasks = await db
    .select({
      rowIndex:  tasksTable.rowIndex,
      tableType: tasksTable.tableType,
      vehicleId: tasksTable.vehicleId,
      km:        tasksTable.km,
      status:    tasksTable.status,
      type:      tasksTable.type,
      notes:     tasksTable.notes,
    })
    .from(tasksTable)
    .where(
      sql`${tasksTable.scheduledTime} >= ${shiftStart} AND ${tasksTable.scheduledTime} < ${shiftEnd}`
    );

  // Load vehicle plates in a single batch query to avoid N+1 issue
  const vehicleIds = [...new Set(tasks.map((t) => t.vehicleId).filter(Boolean))] as number[];
  const vehicleMap = new Map<number, string>();
  if (vehicleIds.length > 0) {
    const vehicles = await db
      .select({ id: vehiclesTable.id, plate: vehiclesTable.plate })
      .from(vehiclesTable)
      .where(inArray(vehiclesTable.id, vehicleIds));
    for (const v of vehicles) {
      vehicleMap.set(v.id, v.plate);
    }
  }

  const getPlateFromNotes = (notes: string | null | undefined): string => {
    if (!notes) return "";
    const match = notes.match(/Plaka:\s*([^|]+)/i);
    return match ? match[1].trim() : "";
  };

  // Write plates and KM into sheet 1 (index 0) — first sheet is the main list
  const ws = wb.worksheets[0];
  if (ws) {
    for (const task of tasks) {
      if (task.rowIndex == null) continue;
      const row = task.rowIndex; // 1-based Excel row

      if (task.tableType === "left") {
        // GELİR — left table: PLAKA = C, KM = G
        const cellPlate = ws.getCell(`C${row}`);
        const cellKm = ws.getCell(`G${row}`);

        if (task.status === "cancelled") {
          cellPlate.value = "İPTAL";
        } else {
          let plate = "";
          if (task.vehicleId) {
            plate = vehicleMap.get(task.vehicleId) ?? "";
          } else if (task.notes) {
            plate = getPlateFromNotes(task.notes);
          }
          if (plate) {
            cellPlate.value = plate;
          }
        }
        if (task.km) {
          cellKm.value = Number(task.km);
        }

        // Apply yellow background to technical tasks if possible
        if (task.type === "technical") {
          ["B", "C", "D", "G"].forEach((col) => {
            const cell = ws.getCell(`${col}${row}`);
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFFFFF" }
            };
          });
        }
      } else if (task.tableType === "right") {
        // GİDER — right table: PLAKA = I, KM = M
        const cellPlate = ws.getCell(`I${row}`);
        const cellKm = ws.getCell(`M${row}`);

        if (task.status === "cancelled") {
          cellPlate.value = "İPTAL";
        } else {
          let plate = "";
          if (task.vehicleId) {
            plate = vehicleMap.get(task.vehicleId) ?? "";
          } else if (task.notes) {
            plate = getPlateFromNotes(task.notes);
          }
          if (plate) {
            cellPlate.value = plate;
          }
        }
        if (task.km) {
          cellKm.value = Number(task.km);
        }

        // Apply yellow background to technical tasks if possible
        if (task.type === "technical") {
          ["H", "I", "J", "M"].forEach((col) => {
            const cell = ws.getCell(`${col}${row}`);
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFFFFF" }
            };
          });
        }
      }
    }
  }

  // Write back to buffer — preserve existing format
  const outBuf = await wb.xlsx.writeBuffer();

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="sevkiyat_${date}.xlsx"`);
  return res.send(outBuf);
});

// GET /excel/files
// Returns a list of all stored Excel files
router.get("/files", async (req, res) => {
  const files = await db
    .select({
      id: excelFilesTable.id,
      date: excelFilesTable.date,
      filename: excelFilesTable.filename,
      uploadedAt: excelFilesTable.uploadedAt,
    })
    .from(excelFilesTable)
    .orderBy(sql`${excelFilesTable.uploadedAt} DESC`);
  return res.json(files);
});

// DELETE /excel/files/:id
// Deletes a stored Excel file by ID
router.delete("/files/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(excelFilesTable).where(eq(excelFilesTable.id, id));
  return res.status(204).send();
});

// GET /excel/has?date=YYYY-MM-DD
// Returns whether a file is stored for this date
router.get("/has", async (req, res) => {
  const date = req.query.date as string;
  if (!date) return res.status(400).json({ error: "date query param required" });
  const dmy = formatToDDMMYY(date);

  const [file] = await db
    .select({ id: excelFilesTable.id, filename: excelFilesTable.filename, uploadedAt: excelFilesTable.uploadedAt })
    .from(excelFilesTable)
    .where(sql`${excelFilesTable.date} = ${date} OR ${excelFilesTable.date} = ${dmy}`);

  return res.json({ exists: !!file, filename: file?.filename ?? null, uploadedAt: file?.uploadedAt ?? null });
});

export default router;
