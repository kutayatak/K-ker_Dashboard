import { Router } from "express";
import { db, excelFilesTable, tasksTable, vehiclesTable, routePresetsTable } from "@workspace/db";
import { eq, sql, inArray, and } from "drizzle-orm";
import ExcelJS from "exceljs";

const router = Router();


const simplifyPlate = (plateStr: string): string => {
  let clean = plateStr.trim();
  const suffixMatch = clean.match(/^(.*?)\s*\(?(V[1-3])\)?$/i);
  if (suffixMatch) {
    clean = suffixMatch[1].trim();
  }
  clean = clean.replace(/^\d+\s*/, "");
  return clean;
};

// Helper to convert YYYY-MM-DD to DDMMYY
const formatToDDMMYY = (dateStr: string): string => {
  if (!dateStr || !dateStr.includes("-")) return dateStr;
  const [y, m, d] = dateStr.split("-");
  return `${d}${m}${y.slice(2)}`;
};

// Normalize any date string to YYYY-MM-DD for comparison
// Accepts: "YYYY-MM-DD", "DDMMYY" (6-digit), "DDMMYYYY" (8-digit)
const normalizeToYMD = (dateStr: string): string => {
  if (!dateStr) return "";
  if (dateStr.includes("-") && dateStr.length === 10) return dateStr; // already YYYY-MM-DD
  if (/^\d{6}$/.test(dateStr)) {
    // DDMMYY
    const d = dateStr.slice(0, 2);
    const m = dateStr.slice(2, 4);
    const y = "20" + dateStr.slice(4, 6);
    return `${y}-${m}-${d}`;
  }
  if (/^\d{8}$/.test(dateStr)) {
    // DDMMYYYY
    const d = dateStr.slice(0, 2);
    const m = dateStr.slice(2, 4);
    const y = dateStr.slice(4, 8);
    return `${y}-${m}-${d}`;
  }
  return dateStr;
};

// POST /excel/upload
// Saves or replaces the raw Excel file for a given date (base64 encoded body)
// Body: { date: "YYYY-MM-DD", filename: string, data: string (base64) }
router.post("/upload", async (req: any, res: any) => {
  const { date, filename, data } = req.body ?? {};
  if (!date || !data) {
    return res.status(400).json({ error: "date and data are required" });
  }

  try {
    // Always normalize to YYYY-MM-DD for consistent storage
    const normalizedDate = normalizeToYMD(date);
    const legacyDMY = formatToDDMMYY(normalizedDate);

    // Strip data URL prefix if accidentally included (e.g. "data:...;base64,")
    const cleanData = data.includes(",") ? data.split(",")[1] : data;

    // Check if existing records exist under either format (legacy DDMMYY or new YYYY-MM-DD)
    const files = await db
      .select({ id: excelFilesTable.id, date: excelFilesTable.date })
      .from(excelFilesTable)
      .where(inArray(excelFilesTable.date, [normalizedDate, legacyDMY]));

    const canonicalFile = files.find((f) => f.date === normalizedDate);
    const legacyFile = files.find((f) => f.date === legacyDMY);

    if (canonicalFile) {
      // If we already have a canonical record, update it.
      await db
        .update(excelFilesTable)
        .set({
          filename: filename ?? "import.xlsx",
          data: cleanData,
          uploadedAt: new Date(),
        })
        .where(eq(excelFilesTable.id, canonicalFile.id));

      // If we also had a legacy record, delete it so we don't have duplicate/stale records
      if (legacyFile) {
        await db
          .delete(excelFilesTable)
          .where(eq(excelFilesTable.id, legacyFile.id));
      }
    } else if (legacyFile) {
      // If we only have a legacy record, update its date to canonical format and save new data
      await db
        .update(excelFilesTable)
        .set({
          date: normalizedDate, // Safe because normalizedDate does not exist in the DB (canonicalFile is null)
          filename: filename ?? "import.xlsx",
          data: cleanData,
          uploadedAt: new Date(),
        })
        .where(eq(excelFilesTable.id, legacyFile.id));
    } else {
      // Insert new record using canonical YYYY-MM-DD format
      await db.insert(excelFilesTable).values({
        date: normalizedDate,
        filename: filename ?? "import.xlsx",
        data: cleanData,
      });
    }

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[excel/upload] error:", err);
    const errorData = {
      timestamp: new Date().toISOString(),
      message: err?.message ?? String(err),
      stack: err?.stack,
      name: err?.name,
      code: err?.code,
      context: "upload"
    };
    (globalThis as any).lastUploadError = errorData;

    db.select()
      .from(routePresetsTable)
      .where(eq(routePresetsTable.pickupLocation, "__last_error_log__"))
      .limit(1)
      .then((existingList) => {
        const existing = existingList[0];
        if (existing) {
          return db
            .update(routePresetsTable)
            .set({ dropoffLocation: JSON.stringify(errorData), km: "0.0" })
            .where(eq(routePresetsTable.id, existing.id));
        } else {
          return db
            .insert(routePresetsTable)
            .values({ pickupLocation: "__last_error_log__", dropoffLocation: JSON.stringify(errorData), km: "0.0" });
        }
      })
      .catch(() => {});

    return res.status(500).json({
      error: "Excel dosyası kaydedilirken bir hata oluştu.",
      detail: err?.message ?? String(err),
    });
  }
});

// GET /excel/download?date=YYYY-MM-DD
// Returns the stored Excel file with plate values written to the correct cells.
// If no template is stored for the date, falls back to generating a clean workbook
// from manually-added tasks (rowIndex == null) so they are never silently dropped.
router.get("/download", async (req: any, res: any) => {
  const date = req.query.date as string;
  if (!date)
    return res
      .status(400)
      .json({ error: "date query param required (YYYY-MM-DD)" });

  try {
    // Normalize the requested date to YYYY-MM-DD for reliable comparison
    const requestedYMD = normalizeToYMD(date);
    const requestedDMY = formatToDDMMYY(requestedYMD);

    // Fetch matching file record (may be null — handled below)
    const files = await db
      .select()
      .from(excelFilesTable)
      .where(inArray(excelFilesTable.date, [requestedYMD, requestedDMY]))
      .limit(1);
    const file = files[0] ?? null;

    const [y, m, d] = requestedYMD.split("-").map(Number);
    const shiftStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    const shiftEnd = new Date(Date.UTC(y, m - 1, d + 2, 0, 0, 0, 0)); // +2 to catch midnight-overflow legacy tasks

    // Fetch all tasks for this shift date
    const tasks = await db
      .select({
        rowIndex: tasksTable.rowIndex,
        tableType: tasksTable.tableType,
        vehicleId: tasksTable.vehicleId,
        km: tasksTable.km,
        status: tasksTable.status,
        type: tasksTable.type,
        notes: tasksTable.notes,
        scheduledTime: tasksTable.scheduledTime,
        flightCode: tasksTable.flightCode,
        pickupLocation: tasksTable.pickupLocation,
        dropoffLocation: tasksTable.dropoffLocation,
      })
      .from(tasksTable)
      .where(
        sql`
          ${tasksTable.shiftDate} = ${requestedYMD}
          OR (
            ${tasksTable.shiftDate} IS NULL
            AND ${tasksTable.scheduledTime} >= ${shiftStart}
            AND ${tasksTable.scheduledTime} < ${shiftEnd}
          )
        `,
      );

    // If no template AND no tasks at all → return 404
    if (!file && tasks.length === 0) {
      return res
        .status(404)
        .json({ error: `Bu tarih için kayıtlı Excel dosyası veya iş bulunamadı (${requestedYMD})` });
    }

    // Load vehicle plates in a single batch query to avoid N+1 issue
    const vehicleIds = [
      ...new Set(tasks.map((t) => t.vehicleId).filter(Boolean)),
    ] as number[];
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

    const wb = new ExcelJS.Workbook();

    // ── CASE A: Template exists → load it and overlay plate/km data ──────
    if (file) {
      const rawData = file.data.includes(",") ? file.data.split(",")[1] : file.data;
      const buf = Buffer.from(rawData, "base64");
      await wb.xlsx.load(buf as any);

      const ws = wb.worksheets[0];
      if (ws) {
        for (const task of tasks) {
          if (task.rowIndex == null) continue;
          const row = task.rowIndex; // 1-based Excel row

          if (task.tableType === "left") {
            const cellPlate = ws.getCell(`C${row}`);
            const cellKm = ws.getCell(`G${row}`);
            if (task.status === "cancelled") {
              cellPlate.value = "İPTAL";
              cellKm.value = 0;
            } else {
              let plate = "";
              if (task.vehicleId) plate = vehicleMap.get(task.vehicleId) ?? "";
              else if (task.notes) plate = getPlateFromNotes(task.notes);
              if (plate) cellPlate.value = simplifyPlate(plate);
              if (task.km) cellKm.value = Number(task.km);
            }
          } else if (task.tableType === "right") {
            const cellPlate = ws.getCell(`I${row}`);
            const cellKm = ws.getCell(`M${row}`);
            if (task.status === "cancelled") {
              cellPlate.value = "İPTAL";
              cellKm.value = 0;
            } else {
              let plate = "";
              if (task.vehicleId) plate = vehicleMap.get(task.vehicleId) ?? "";
              else if (task.notes) plate = getPlateFromNotes(task.notes);
              if (plate) cellPlate.value = simplifyPlate(plate);
              if (task.km) cellKm.value = Number(task.km);
            }
          }
        }

        // Append manually-added tasks (rowIndex == null) after the template rows
        appendManualTasks(ws, tasks, vehicleMap, getPlateFromNotes);
      }
    } else {
      // ── CASE B: No template → generate a clean workbook with all tasks ──
      const ws = wb.addWorksheet(`Sevkiyat ${requestedYMD}`);
      appendManualTasks(ws, tasks, vehicleMap, getPlateFromNotes);
    }

    // Write back to buffer and send
    const outBuf = Buffer.from(await wb.xlsx.writeBuffer());

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sevkiyat_${requestedYMD}.xlsx"`,
    );
    return res.send(outBuf);
  } catch (err: any) {
    console.error("[excel/download] error:", err);
    return res.status(500).json({
      error: "Excel dosyası oluşturulurken bir hata oluştu.",
      detail: err?.message ?? String(err),
    });
  }
});

/**
 * Appends manually-added tasks (rowIndex == null) to a worksheet as a clearly-labelled
 * table at the bottom. Used both when a template exists (appended after template rows)
 * and when no template exists (entire worksheet is built from scratch).
 */
function appendManualTasks(
  ws: ExcelJS.Worksheet,
  tasks: Array<{
    rowIndex: number | null;
    tableType: string | null;
    vehicleId: number | null;
    km: string | null;
    status: string;
    type: string;
    notes: string | null;
    scheduledTime: Date;
    flightCode: string | null;
    pickupLocation: string;
    dropoffLocation: string;
  }>,
  vehicleMap: Map<number, string>,
  getPlateFromNotes: (notes: string | null | undefined) => string,
) {
  const manualTasks = tasks.filter((t) => t.rowIndex == null);
  if (manualTasks.length === 0) return;

  // Sort by scheduled time
  manualTasks.sort(
    (a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime(),
  );

  // Find the actual last row with content (to skip empty formatted rows at the bottom of templates)
  let lastContentRow = 0;
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== "") {
        hasValue = true;
      }
    });
    if (hasValue) {
      lastContentRow = Math.max(lastContentRow, rowNumber);
    }
  });

  let lastRow = lastContentRow > 0 ? lastContentRow + 2 : 1;

  // Section header
  const headerRow = ws.getRow(lastRow);
  headerRow.getCell(1).value = "Elle Eklenen İşler";
  headerRow.getCell(1).font = { bold: true, size: 12, color: { argb: "FF1D6348" } };
  headerRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
  headerRow.commit();
  lastRow++;

  // Column headers
  const cols = ["S.NO", "TİP", "UÇUŞ KODU", "SAAT", "NEREDEN", "NEREYE", "PLAKA", "EKİP", "KM", "DURUM"];
  const colHeaderRow = ws.getRow(lastRow);
  cols.forEach((col, i) => {
    const cell = colHeaderRow.getCell(i + 1);
    cell.value = col;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF9CA3AF" } },
    };
  });
  colHeaderRow.commit();
  lastRow++;

  let sno = 1;
  for (const task of manualTasks) {
    const plate = (() => {
      if (task.status === "cancelled") return "İPTAL";
      let p = "";
      if (task.vehicleId) p = vehicleMap.get(task.vehicleId) ?? "";
      else if (task.notes) p = getPlateFromNotes(task.notes);
      return p ? simplifyPlate(p) : "";
    })();

    const crew = (() => {
      if (!task.notes) return "";
      const parts = task.notes.split(/plaka:/i);
      let c = parts[0].trim();
      if (c.endsWith("|")) c = c.slice(0, -1).trim();
      return c;
    })();

    const scheduledDate =
      task.scheduledTime instanceof Date ? task.scheduledTime : new Date(task.scheduledTime as any);
    const timeStr = isNaN(scheduledDate.getTime())
      ? ""
      : `${String(scheduledDate.getUTCHours()).padStart(2, "0")}:${String(scheduledDate.getUTCMinutes()).padStart(2, "0")}`;

    const typeLabel =
      task.type === "hotel_pickup"
        ? "GELİR"
        : task.type === "airport_run"
          ? "GİDER"
          : task.type === "extra"
            ? task.tableType === "left" ? "EKSTRA GELİR" : "EKSTRA GİDER"
            : "TEKNİK";

    const statusLabel =
      task.status === "cancelled"
        ? "İPTAL"
        : task.status === "completed"
          ? "Tamamlandı"
          : "Taslak";

    const dataRow = ws.getRow(lastRow);
    dataRow.getCell(1).value = sno++;
    dataRow.getCell(2).value = typeLabel;
    dataRow.getCell(3).value = task.flightCode ?? "";
    dataRow.getCell(4).value = timeStr;
    dataRow.getCell(5).value = task.pickupLocation ?? "";
    dataRow.getCell(6).value = task.dropoffLocation ?? "";
    dataRow.getCell(7).value = plate;
    dataRow.getCell(8).value = crew;
    dataRow.getCell(9).value = task.km ? Number(task.km) : "";
    dataRow.getCell(10).value = statusLabel;
    dataRow.commit();
    lastRow++;
  }
}




// GET /excel/files
// Returns a list of all stored Excel files
router.get("/files", async (req, res) => {
  try {
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
  } catch (err: any) {
    console.error("[excel/files] error:", err);
    return res.status(500).json({
      error: "Yüklü dosyalar listelenirken bir hata oluştu.",
      detail: err?.message ?? String(err),
    });
  }
});

// DELETE /excel/files/:id
// Deletes a stored Excel file by ID and its corresponding tasks
router.delete("/files/:id", async (req, res) => {
  const id = Number(req.params.id);

  await db.transaction(async (tx) => {
    // 1. Fetch file record
    const [file] = await tx
      .select()
      .from(excelFilesTable)
      .where(eq(excelFilesTable.id, id));
    if (file) {
      const shiftDateStr = file.date;
      let y, m, d;
      if (shiftDateStr.includes("-")) {
        const parts = shiftDateStr.split("-").map(Number);
        y = parts[0];
        m = parts[1];
        d = parts[2];
      } else if (shiftDateStr.length === 6) {
        d = Number(shiftDateStr.slice(0, 2));
        m = Number(shiftDateStr.slice(2, 4));
        y = Number("20" + shiftDateStr.slice(4, 6));
      }

      if (y && m && d) {
        const shiftStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
        const shiftEnd = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));

        // 2. Delete tasks for that shift date
        await tx
          .delete(tasksTable)
          .where(
            and(
              sql`${tasksTable.scheduledTime} >= ${shiftStart} AND ${tasksTable.scheduledTime} < ${shiftEnd}`,
            ),
          );
      }
    }

    // 3. Delete the file record
    await tx.delete(excelFilesTable).where(eq(excelFilesTable.id, id));
  });

  return res.status(204).send();
});

// GET /excel/has?date=YYYY-MM-DD
// Returns whether a file is stored for this date
router.get("/has", async (req, res) => {
  const date = req.query.date as string;
  if (!date)
    return res.status(400).json({ error: "date query param required" });

  const requestedYMD = normalizeToYMD(date);
  const requestedDMY = formatToDDMMYY(requestedYMD);

  try {
    const files = await db
      .select({
        id: excelFilesTable.id,
        filename: excelFilesTable.filename,
        uploadedAt: excelFilesTable.uploadedAt,
        date: excelFilesTable.date,
      })
      .from(excelFilesTable)
      .where(inArray(excelFilesTable.date, [requestedYMD, requestedDMY]))
      .limit(1);

    const file = files[0];

    return res.json({
      exists: !!file,
      filename: file?.filename ?? null,
      uploadedAt: file?.uploadedAt ?? null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to check excel storage status", details: err.message });
  }
});

// GET /excel/debug-tasks
// Returns the last 100 tasks in the database for debugging (dev-only)
router.get("/debug-tasks", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Forbidden in production" });
  }

  try {
    const tasks = await db
      .select()
      .from(tasksTable)
      .orderBy(sql`${tasksTable.id} DESC`)
      .limit(100);
    return res.json(tasks);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch debug tasks", details: err.message });
  }
});

// GET /excel/tasks-for-date?date=YYYY-MM-DD
// Returns all tasks for a given date including shiftDate, rowIndex — for debugging download issues
router.get("/tasks-for-date", async (req: any, res: any) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Forbidden in production" });
  }
  const date = req.query.date as string;
  if (!date) return res.status(400).json({ error: "date query param required (YYYY-MM-DD)" });

  const requestedYMD = normalizeToYMD(date);
  const [y, m, d] = requestedYMD.split("-").map(Number);
  const shiftStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const shiftEnd = new Date(Date.UTC(y, m - 1, d + 2, 0, 0, 0, 0));

  try {
    const tasks = await db
      .select({
        id: tasksTable.id,
        type: tasksTable.type,
        shiftDate: tasksTable.shiftDate,
        rowIndex: tasksTable.rowIndex,
        tableType: tasksTable.tableType,
        scheduledTime: tasksTable.scheduledTime,
        status: tasksTable.status,
        pickupLocation: tasksTable.pickupLocation,
        flightCode: tasksTable.flightCode,
      })
      .from(tasksTable)
      .where(
        sql`
          ${tasksTable.shiftDate} = ${requestedYMD}
          OR (
            ${tasksTable.shiftDate} IS NULL
            AND ${tasksTable.scheduledTime} >= ${shiftStart}
            AND ${tasksTable.scheduledTime} < ${shiftEnd}
          )
        `,
      )
      .orderBy(sql`${tasksTable.id} DESC`);

    return res.json({
      requestedYMD,
      shiftStart,
      shiftEnd,
      totalFound: tasks.length,
      withRowIndex: tasks.filter(t => t.rowIndex != null).length,
      withoutRowIndex: tasks.filter(t => t.rowIndex == null).length,
      tasks,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch tasks for date", details: err.message });
  }
});



// GET /excel/db-diagnostic
// Runs diagnostics on DB connection and tables, returning detailed errors (including stacks)
router.get("/db-diagnostic", async (req: any, res: any) => {
  const report: any = {
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    checks: {},
    lastGlobalError: (globalThis as any).lastGlobalError ?? null,
    lastUploadError: (globalThis as any).lastUploadError ?? null,
    lastDbErrorLog: null,
    requestLogs: (globalThis as any).requestLogs ?? [],
  };

  try {
    const [log] = await db
      .select()
      .from(routePresetsTable)
      .where(eq(routePresetsTable.pickupLocation, "__last_error_log__"))
      .limit(1);
    report.lastDbErrorLog = log ? JSON.parse(log.dropoffLocation) : null;
  } catch (err: any) {
    report.lastDbErrorLog = { error: "Failed to read diagnostic error log from DB", message: err.message };
  }

  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    report.checks.dbConnection = { ok: true, durationMs: Date.now() - start };
  } catch (err: any) {
    report.checks.dbConnection = {
      ok: false,
      message: err?.message ?? String(err),
      code: err?.code,
      stack: err?.stack
    };
  }

  try {
    const start = Date.now();
    const countRes = await db
      .select({ count: sql<number>`count(*)` })
      .from(excelFilesTable);
    report.checks.excelFilesTable = {
      ok: true,
      count: countRes[0]?.count ?? 0,
      durationMs: Date.now() - start
    };
  } catch (err: any) {
    report.checks.excelFilesTable = {
      ok: false,
      message: err?.message ?? String(err),
      code: err?.code,
      stack: err?.stack
    };
  }

  try {
    const start = Date.now();
    const countRes = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasksTable);
    report.checks.tasksTable = {
      ok: true,
      count: countRes[0]?.count ?? 0,
      durationMs: Date.now() - start
    };
  } catch (err: any) {
    report.checks.tasksTable = {
      ok: false,
      message: err?.message ?? String(err),
      code: err?.code,
      stack: err?.stack
    };
  }

  return res.json(report);
});

export default router;
