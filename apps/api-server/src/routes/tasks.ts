import { Router } from "express";
import { db, tasksTable, vehiclesTable, accountingTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  ListTasksQueryParams,
  CreateTaskBody,
  GetTaskParams,
  UpdateTaskBody,
  UpdateTaskParams,
  DeleteTaskParams,
  ImportTasksBody,
  BatchNotifyTasksBody,
} from "@workspace/api-zod";

const router = Router();

// Helper: join task with vehicle info
async function enrichTask(task: typeof tasksTable.$inferSelect) {
  if (task.vehicleId) {
    const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, task.vehicleId));
    return {
      ...task,
      fee: task.fee ? Number(task.fee) : null,
      vehicleName: vehicle?.name ?? null,
      driverName: vehicle?.driverName ?? null,
    };
  }
  return { ...task, fee: task.fee ? Number(task.fee) : null, vehicleName: null, driverName: null };
}

// GET /tasks
router.get("/", async (req, res) => {
  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query params" });

  const { status, type, date } = parsed.data;
  const conditions = [];

  if (status) conditions.push(eq(tasksTable.status, status));
  if (type) conditions.push(eq(tasksTable.type, type));
  if (date) {
    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);
    conditions.push(sql`${tasksTable.scheduledTime} >= ${start} AND ${tasksTable.scheduledTime} < ${end}`);
  }

  const tasks = conditions.length
    ? await db.select().from(tasksTable).where(conditions.length === 1 ? conditions[0] : and(...conditions))
    : await db.select().from(tasksTable);

  const enriched = await Promise.all(tasks.map(enrichTask));
  return res.json(enriched);
});

// GET /tasks/summary
router.get("/summary", async (_req, res) => {
  const allTasks = await db.select().from(tasksTable);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayCompleted = allTasks.filter(
    (t) => t.status === "completed" && t.scheduledTime >= today && t.scheduledTime < tomorrow
  );

  const todayRevenue = todayCompleted.reduce((sum, t) => sum + Number(t.fee ?? 0), 0);

  return res.json({
    total: allTasks.length,
    draft: allTasks.filter((t) => t.status === "draft").length,
    assigned: allTasks.filter((t) => t.status === "assigned").length,
    inProgress: allTasks.filter((t) => t.status === "in_progress").length,
    completed: allTasks.filter((t) => t.status === "completed").length,
    cancelled: allTasks.filter((t) => t.status === "cancelled").length,
    hotelPickups: allTasks.filter((t) => t.type === "hotel_pickup").length,
    airportRuns: allTasks.filter((t) => t.type === "airport_run").length,
    extras: allTasks.filter((t) => t.type === "extra").length,
    todayCompleted: todayCompleted.length,
    todayRevenue,
  });
});

// POST /tasks/import
router.post("/import", async (req, res) => {
  const parsed = ImportTasksBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error });

  const { tasks, excelBase64, excelDate, excelFilename } = parsed.data;

  // ── Save Excel file if provided ──────────────────────────────────────────
  if (excelBase64 && excelDate) {
    const { excelFilesTable } = await import("@workspace/db");
    await db
      .insert(excelFilesTable)
      .values({ date: excelDate, filename: excelFilename ?? "import.xlsx", data: excelBase64 })
      .onConflictDoUpdate({
        target: excelFilesTable.date,
        set: { filename: excelFilename ?? "import.xlsx", data: excelBase64, uploadedAt: new Date() },
      });
  }

  // ── Load route presets for auto-KM ──────────────────────────────────────
  const { routePresetsTable } = await import("@workspace/db");
  const presets = await db.select().from(routePresetsTable);

  const created = [];
  let updated = 0;
  let skipped = 0;

  for (const t of tasks) {
    try {
      let vehicleId: number | null = null;
      const isImportCancelled = (t as any).status === "cancelled" || 
        (t.notes && (t.notes.includes("İPTAL") || t.notes.includes("IPTAL") || t.notes.toLowerCase().includes("iptal")));
      
      const hasPlate = t.notes && (t.notes.includes("Plaka:") || t.notes.toLowerCase().includes("plaka")) && !isImportCancelled;
      const status = isImportCancelled ? "cancelled" : (hasPlate ? "completed" : "draft");

      if (hasPlate && t.notes && !isImportCancelled) {
        const plateMatch = t.notes.match(/Plaka:\s*([^|]+)/i);
        if (plateMatch) {
          const plate = plateMatch[1].trim();
          
          // First try exact match
          let [vehicle] = await db
            .select({ id: vehiclesTable.id })
            .from(vehiclesTable)
            .where(eq(vehiclesTable.plate, plate));
            
          // If not found, try matching prefix (e.g. "06 ABC 123" matches "06 ABC 123 (V1)")
          if (!vehicle) {
            const matches = await db
              .select({ id: vehiclesTable.id, plate: vehiclesTable.plate })
              .from(vehiclesTable)
              .where(sql`${vehiclesTable.plate} LIKE ${plate + '%'}`);
            
            if (matches.length > 0) {
              const taskTime = new Date(t.scheduledTime);
              const hour = taskTime.getHours();
              
              // Shift hour logic:
              // Vardiya 1: 06:00 to 14:00
              // Vardiya 2: 14:00 to 22:00
              // Vardiya 3: 22:00 to 06:00
              let shiftSuffix = "";
              if (hour >= 6 && hour < 14) shiftSuffix = "(V1)";
              else if (hour >= 14 && hour < 22) shiftSuffix = "(V2)";
              else shiftSuffix = "(V3)";
              
              const shiftMatch = matches.find(m => m.plate.includes(shiftSuffix));
              vehicle = shiftMatch || matches[0];
            }
          }
          
          if (vehicle) {
            vehicleId = vehicle.id;
          }
        }
      }

      // Auto-fill KM from route preset if not provided
      let km = t.km != null ? String(t.km) : null;
      if (!km) {
        const match = presets.find(
          (p) =>
            p.pickupLocation.trim().toLowerCase() === (t.pickupLocation ?? "").trim().toLowerCase() &&
            p.dropoffLocation.trim().toLowerCase() === (t.dropoffLocation ?? "").trim().toLowerCase()
        );
        if (match) km = String(match.km);
      }

      const values = {
        type: t.type,
        flightCode: t.flightCode ?? null,
        passengerCount: t.passengerCount,
        pickupLocation: t.pickupLocation,
        dropoffLocation: t.dropoffLocation,
        scheduledTime: new Date(t.scheduledTime),
        notes: t.notes ?? null,
        fee: t.fee != null ? String(t.fee) : null,
        km,
        importKey: t.importKey ?? null,
        rowIndex: t.rowIndex ?? null,
        tableType: t.tableType ?? null,
        status,
        vehicleId: isImportCancelled ? null : vehicleId,
      };

      if (t.importKey) {
        // UPSERT — update everything except vehicleId/status if already assigned
        const [existing] = await db
          .select({ id: tasksTable.id, vehicleId: tasksTable.vehicleId, status: tasksTable.status })
          .from(tasksTable)
          .where(eq(tasksTable.importKey, t.importKey));

        if (existing) {
          // Don't override assigned vehicles or completed tasks unless new import is explicitly cancelled
          const keepVehicle = existing.vehicleId != null && !isImportCancelled;
          const keepStatus = (existing.status === "assigned" || existing.status === "completed") && !isImportCancelled;
          const finalStatus = isImportCancelled ? "cancelled" : (keepStatus ? existing.status : status);

          const [task] = await db
            .update(tasksTable)
            .set({
              ...values,
              vehicleId: keepVehicle ? existing.vehicleId : (isImportCancelled ? null : vehicleId),
              status: finalStatus,
            })
            .where(eq(tasksTable.id, existing.id))
            .returning();
          created.push(await enrichTask(task));
          updated++;
        } else {
          const [task] = await db.insert(tasksTable).values(values).returning();
          created.push(await enrichTask(task));
        }
      } else {
        // No importKey — plain insert
        const [task] = await db.insert(tasksTable).values(values).returning();
        created.push(await enrichTask(task));
      }
    } catch {
      skipped++;
    }
  }

  return res.json({ created: created.length - updated, updated, skipped, tasks: created });
});


// POST /tasks/batch-notify
router.post("/batch-notify", async (req, res) => {
  const parsed = BatchNotifyTasksBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

  let sent = 0;
  let failed = 0;

  const driverTasks = new Map<number, { phone: string; driverName: string; tasks: typeof tasksTable.$inferSelect[] }>();

  for (const taskId of parsed.data.taskIds) {
    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
    if (!task || task.status !== "draft" || !task.vehicleId) {
      failed++;
      continue;
    }

    const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, task.vehicleId));
    if (!vehicle) { failed++; continue; }

    if (!driverTasks.has(task.vehicleId)) {
      driverTasks.set(task.vehicleId, { phone: vehicle.phone, driverName: vehicle.driverName, tasks: [] });
    }
    driverTasks.get(task.vehicleId)!.tasks.push(task);
  }

  const links = [];

  for (const [vehicleId, data] of driverTasks.entries()) {
    // Sort tasks by scheduled time
    const sortedTasks = data.tasks.sort(
      (a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
    );

    let messageText = `Merhaba ${data.driverName}\n\n`;
    const updatedTaskIds = [];

    for (const task of sortedTasks) {
      const time = new Date(task.scheduledTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      // Crew notes: use notes field (already contains crew info like "2CPT"), strip plate part
      const crew = task.notes
        ? task.notes.includes(" | Plaka:") ? task.notes.split(" | Plaka:")[0] : task.notes
        : "";
      // Direction label based on type
      const direction = task.type === "airport_run" ? "GELİR" : task.type === "hotel_pickup" ? "GİDER" : "EKSTRA";
      // Main location: hotel name
      const location = task.type === "airport_run" ? task.dropoffLocation : task.pickupLocation;
      // Flight code
      const flight = task.flightCode ?? "";

      // Format: "FMF 183   06:00   RİXOS   2CPT   GELİR"
      const parts = [flight, time, location, crew, direction].filter(Boolean);
      messageText += parts.join("   ") + "\n";
      updatedTaskIds.push(task.id);
    }

    messageText += "\nİyi çalışmalar!";

    // Format phone for wa.me
    let phone = data.phone.replace(/\D/g, "");
    if (phone.startsWith("0")) phone = phone.substring(1);
    if (phone.length === 10) phone = "90" + phone;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(messageText)}`;
    links.push({ driverName: data.driverName, phone: data.phone, url, taskIds: updatedTaskIds });

    // Update status to assigned
    for (const taskId of updatedTaskIds) {
      await db.update(tasksTable).set({ status: "assigned" }).where(eq(tasksTable.id, taskId));
      sent++;
    }
  }

  return res.json({ sent, failed, links });
});



// POST /tasks
router.post("/", async (req, res) => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

  const [task] = await db
    .insert(tasksTable)
    .values({
      ...parsed.data,
      scheduledTime: new Date(parsed.data.scheduledTime),
      fee: parsed.data.fee != null ? String(parsed.data.fee) : null,
      km: parsed.data.km != null ? String(parsed.data.km) : null,
    })
    .returning();

  return res.status(201).json(await enrichTask(task));
});

// GET /tasks/:id
router.get("/:id", async (req, res) => {
  const parsed = GetTaskParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, parsed.data.id));
  if (!task) return res.status(404).json({ error: "Task not found" });

  return res.json(await enrichTask(task));
});

// PATCH /tasks/:id
router.patch("/:id", async (req, res) => {
  const idParsed = UpdateTaskParams.safeParse({ id: Number(req.params.id) });
  if (!idParsed.success) return res.status(400).json({ error: "Invalid id" });

  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.scheduledTime) updateData.scheduledTime = new Date(parsed.data.scheduledTime);
  if (parsed.data.actualPickupTime) updateData.actualPickupTime = new Date(parsed.data.actualPickupTime);
  if (parsed.data.actualDropoffTime) updateData.actualDropoffTime = new Date(parsed.data.actualDropoffTime);
  if (parsed.data.fee != null) updateData.fee = String(parsed.data.fee);
  if (parsed.data.km != null) updateData.km = String(parsed.data.km);

  const [task] = await db
    .update(tasksTable)
    .set(updateData)
    .where(eq(tasksTable.id, idParsed.data.id))
    .returning();

  if (!task) return res.status(404).json({ error: "Task not found" });

  // If task completed and has a fee, create accounting record
  if (parsed.data.status === "completed" && task.vehicleId && task.fee) {
    const today = new Date().toISOString().split("T")[0];
    await db.insert(accountingTable).values({
      vehicleId: task.vehicleId,
      taskId: task.id,
      amount: task.fee,
      date: today,
    }).onConflictDoNothing();

    // Move vehicle back to empty queue (FIFO — add to end)
    const all = await db
      .select({ qp: vehiclesTable.queuePosition })
      .from(vehiclesTable)
      .where(eq(vehiclesTable.status, "empty"));
    const maxPos = all.reduce((max, v) => Math.max(max, v.qp ?? 0), 0);

    await db
      .update(vehiclesTable)
      .set({ status: "empty", queuePosition: maxPos + 1 })
      .where(eq(vehiclesTable.id, task.vehicleId));
  }

  // If task is in_progress, mark vehicle as busy
  if (parsed.data.status === "in_progress" && task.vehicleId) {
    await db
      .update(vehiclesTable)
      .set({ status: "busy", queuePosition: null })
      .where(eq(vehiclesTable.id, task.vehicleId));
  }

  return res.json(await enrichTask(task));
});

// DELETE /tasks/:id
router.delete("/:id", async (req, res) => {
  const parsed = DeleteTaskParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

  await db.delete(tasksTable).where(eq(tasksTable.id, parsed.data.id));
  return res.status(204).send();
});

export default router;
