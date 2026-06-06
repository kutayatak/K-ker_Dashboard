import { Router } from "express";
import { db, tasksTable, vehiclesTable, accountingTable, routePresetsTable } from "@workspace/db";
import { eq, and, sql, inArray, or } from "drizzle-orm";
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
    const [vehicle] = await db
      .select()
      .from(vehiclesTable)
      .where(eq(vehiclesTable.id, task.vehicleId));
    return {
      ...task,
      fee: task.fee ? Number(task.fee) : null,
      vehicleName: vehicle?.name ?? null,
      driverName: vehicle?.driverName ?? null,
    };
  }
  return {
    ...task,
    fee: task.fee ? Number(task.fee) : null,
    vehicleName: null,
    driverName: null,
  };
}

// GET /tasks
router.get("/", async (req, res) => {
  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid query params" });

  const { status, type, date } = parsed.data;
  const conditions = [];

  if (status) conditions.push(eq(tasksTable.status, status));
  if (type) conditions.push(eq(tasksTable.type, type));
  if (date) {
    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);
    conditions.push(
      sql`${tasksTable.scheduledTime} >= ${start} AND ${tasksTable.scheduledTime} < ${end}`,
    );
  }

  const tasks = await db
    .select({
      task: tasksTable,
      vehicleName: vehiclesTable.name,
      driverName: vehiclesTable.driverName,
    })
    .from(tasksTable)
    .leftJoin(vehiclesTable, eq(tasksTable.vehicleId, vehiclesTable.id))
    .where(
      conditions.length
        ? conditions.length === 1
          ? conditions[0]
          : and(...conditions)
        : undefined,
    );

  const enriched = tasks.map(({ task, vehicleName, driverName }) => ({
    ...task,
    fee: task.fee ? Number(task.fee) : null,
    vehicleName: vehicleName ?? null,
    driverName: driverName ?? null,
  }));

  return res.json(enriched);
});

// GET /tasks/summary
router.get("/summary", async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  try {
    const [summary] = await db
      .select({
        total: sql<number>`count(*)`,
        draft: sql<number>`count(*) filter (where ${tasksTable.status} = 'draft')`,
        assigned: sql<number>`count(*) filter (where ${tasksTable.status} = 'assigned')`,
        inProgress: sql<number>`count(*) filter (where ${tasksTable.status} = 'in_progress')`,
        completed: sql<number>`count(*) filter (where ${tasksTable.status} = 'completed')`,
        cancelled: sql<number>`count(*) filter (where ${tasksTable.status} = 'cancelled')`,
        hotelPickups: sql<number>`count(*) filter (where ${tasksTable.type} = 'hotel_pickup')`,
        airportRuns: sql<number>`count(*) filter (where ${tasksTable.type} = 'airport_run')`,
        extras: sql<number>`count(*) filter (where ${tasksTable.type} = 'extra')`,
        todayCompleted: sql<number>`count(*) filter (where ${tasksTable.status} = 'completed' and ${tasksTable.scheduledTime} >= ${today} and ${tasksTable.scheduledTime} < ${tomorrow})`,
        todayRevenue: sql<number | null>`sum(case when ${tasksTable.status} = 'completed' and ${tasksTable.scheduledTime} >= ${today} and ${tasksTable.scheduledTime} < ${tomorrow} then cast(${tasksTable.fee} as numeric) else 0 end)`,
      })
      .from(tasksTable);

    return res.json({
      total: Number(summary?.total ?? 0),
      draft: Number(summary?.draft ?? 0),
      assigned: Number(summary?.assigned ?? 0),
      inProgress: Number(summary?.inProgress ?? 0),
      completed: Number(summary?.completed ?? 0),
      cancelled: Number(summary?.cancelled ?? 0),
      hotelPickups: Number(summary?.hotelPickups ?? 0),
      airportRuns: Number(summary?.airportRuns ?? 0),
      extras: Number(summary?.extras ?? 0),
      todayCompleted: Number(summary?.todayCompleted ?? 0),
      todayRevenue: Number(summary?.todayRevenue ?? 0),
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to load summary", details: err.message });
  }
});

// GET /tasks/calendar
router.get("/calendar", async (_req, res) => {
  try {
    const result = await db
      .select({
        date: sql<string>`DATE(${tasksTable.scheduledTime})`,
        hasActive: sql<boolean>`BOOL_OR(${tasksTable.status} != 'completed' AND ${tasksTable.status} != 'cancelled')`,
      })
      .from(tasksTable)
      .groupBy(sql`DATE(${tasksTable.scheduledTime})`);

    return res.json(
      result.map((r) => ({
        date: r.date,
        hasActive: !!r.hasActive,
      }))
    );
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to load tasks calendar highlights", details: err.message });
  }
});

function normalizePlate(plateStr: string): string {
  return plateStr.toUpperCase().replace(/\s+/g, "");
}

function getBaseAndSuffix(plateStr: string) {
  const clean = plateStr.trim();
  const match = clean.match(/^(.*?)\s*\(?(V[1-3])\)?$/i);
  if (match) {
    return {
      base: match[1].trim(),
      suffix: match[2].toUpperCase(),
    };
  }
  return {
    base: clean,
    suffix: null,
  };
}

// POST /tasks/import
router.post("/import", async (req, res) => {
  try {
    const parsed = ImportTasksBody.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Invalid body", details: parsed.error });

    const { tasks, excelDate, excelFilename } = parsed.data;

    // NOTE: Excel file is now saved separately via POST /excel/upload
    // (excelBase64 is no longer included in tasks/import payload)

    // ── Load route presets for auto-KM ──────────────────────────────────────
    const presets = await db.select().from(routePresetsTable);

    // Load all vehicles once for efficient space-insensitive matching and in-memory enrichment
    const allVehicles = await db.select().from(vehiclesTable);
    const vehicleMap = new Map<number, any>(
      allVehicles.map((v: any) => [v.id, v]),
    );

    function enrichTaskInMemory(task: typeof tasksTable.$inferSelect) {
      if (task.vehicleId) {
        const vehicle = vehicleMap.get(task.vehicleId);
        return {
          ...task,
          fee: task.fee ? Number(task.fee) : null,
          vehicleName: vehicle?.name ?? null,
          driverName: vehicle?.driverName ?? null,
        };
      }
      return {
        ...task,
        fee: task.fee ? Number(task.fee) : null,
        vehicleName: null,
        driverName: null,
      };
    }

    // Load existing tasks by importKey in a single batch query
    const importKeys = tasks
      .map((t: any) => t.importKey)
      .filter(Boolean) as string[];
    const existingTasks = importKeys.length
      ? await db
          .select({
            id: tasksTable.id,
            importKey: tasksTable.importKey,
            vehicleId: tasksTable.vehicleId,
            status: tasksTable.status,
          })
          .from(tasksTable)
          .where(inArray(tasksTable.importKey, importKeys))
      : [];

    const existingTasksMap = new Map<string, (typeof existingTasks)[number]>(
      existingTasks.map((et: any) => [et.importKey!, et]),
    );

    const created: any[] = [];
    const updatedTasks: any[] = [];
    let updatedCount = 0;
    let skipped = 0;

    // Execute all inserts/updates in a single transaction for maximum speed
    await db.transaction(async (tx: any) => {
      if (excelDate) {
        const [y, m, d] = excelDate.split("-").map(Number);
        const shiftStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
        // Extend end to cover midnight-overflow tasks (e.g. 01:00 next day)
        const shiftEnd = new Date(Date.UTC(y, m - 1, d + 2, 0, 0, 0, 0));

        if (importKeys.length > 0) {
          // Delete drafts that have an importKey but are not in the new import list
          await tx
            .delete(tasksTable)
            .where(
              sql`
                (
                  ${tasksTable.shiftDate} = ${excelDate}
                  OR (
                    ${tasksTable.shiftDate} IS NULL
                    AND ${tasksTable.scheduledTime} >= ${shiftStart}
                    AND ${tasksTable.scheduledTime} < ${shiftEnd}
                  )
                )
                AND ${tasksTable.importKey} IS NOT NULL
                AND NOT (${tasksTable.importKey} = ANY(${importKeys}))
                AND ${tasksTable.status} = 'draft'
              `,
            );
        } else {
          // If import list is empty, delete all drafts for that day
          await tx
            .delete(tasksTable)
            .where(
              sql`
                (
                  ${tasksTable.shiftDate} = ${excelDate}
                  OR (
                    ${tasksTable.shiftDate} IS NULL
                    AND ${tasksTable.scheduledTime} >= ${shiftStart}
                    AND ${tasksTable.scheduledTime} < ${shiftEnd}
                  )
                )
                AND ${tasksTable.importKey} IS NOT NULL
                AND ${tasksTable.status} = 'draft'
              `,
            );
        }
      }

      for (const t of tasks) {
        try {
          let vehicleId: number | null = null;
          const isImportCancelled =
            (t as any).status === "cancelled" ||
            (t.notes &&
              (t.notes.includes("İPTAL") ||
                t.notes.includes("IPTAL") ||
                t.notes.toLowerCase().includes("iptal")));

          const hasPlate =
            t.notes &&
            (t.notes.includes("Plaka:") ||
              t.notes.toLowerCase().includes("plaka")) &&
            !isImportCancelled;
          const status = isImportCancelled
            ? "cancelled"
            : hasPlate
              ? "completed"
              : "draft";

          if (hasPlate && t.notes && !isImportCancelled) {
            const plateMatch = t.notes.match(/Plaka:\s*([^|]+)/i);
            if (plateMatch) {
              const plate = plateMatch[1].trim();
              const imported = getBaseAndSuffix(plate);
              const normalizedImportedBase = normalizePlate(imported.base);

              // Match in-memory: find vehicles whose normalized base plate matches the normalized imported base plate
              const matches = allVehicles.filter((v: any) => {
                const dbParsed = getBaseAndSuffix(v.plate);
                return normalizePlate(dbParsed.base) === normalizedImportedBase;
              });

              if (matches.length > 0) {
                let vehicle = null;
                const taskTime = new Date(t.scheduledTime);
                const hour = taskTime.getHours();

                // Shift hour logic:
                // Vardiya 1: 06:00 to 14:00
                // Vardiya 2: 14:00 to 22:00
                // Vardiya 3: 22:00 to 06:00
                let shiftSuffix = "";
                if (hour >= 6 && hour < 14) shiftSuffix = "V1";
                else if (hour >= 14 && hour < 22) shiftSuffix = "V2";
                else shiftSuffix = "V3";

                const shiftMatch = matches.find((m: any) => {
                  const dbParsed = getBaseAndSuffix(m.plate);
                  return dbParsed.suffix === shiftSuffix;
                });
                vehicle = shiftMatch || matches[0];

                if (vehicle) {
                  vehicleId = vehicle.id;
                }
              }
            }
          }

          // Auto-fill KM from route preset if not provided (direction-independent)
          let km = t.km != null ? String(t.km) : null;
          if (!km) {
            const pickupNormalized = (t.pickupLocation ?? "").trim().toLowerCase();
            const dropoffNormalized = (t.dropoffLocation ?? "").trim().toLowerCase();
            if (pickupNormalized && dropoffNormalized) {
              const match = presets.find(
                (p: any) => {
                  const pPickup = p.pickupLocation.trim().toLowerCase();
                  const pDropoff = p.dropoffLocation.trim().toLowerCase();
                  return (
                    (pPickup === pickupNormalized && pDropoff === dropoffNormalized) ||
                    (pPickup === dropoffNormalized && pDropoff === pickupNormalized)
                  );
                }
              );
              if (match) km = String(match.km);
            }
          }

          const existing = t.importKey ? existingTasksMap.get(t.importKey) : null;

          if (existing) {
            // Task already exists, update it but preserve status and assignment if not draft
            let finalStatus = status;
            let finalVehicleId = vehicleId;

            if (existing.status !== "draft") {
              finalStatus = existing.status;
              finalVehicleId = existing.vehicleId;
            }

            const updateValues = {
              type: t.type,
              flightCode: t.flightCode ?? null,
              passengerCount: t.passengerCount,
              pickupLocation: t.pickupLocation,
              dropoffLocation: t.dropoffLocation,
              scheduledTime: new Date(t.scheduledTime),
              notes: t.notes ?? null,
              fee: t.fee != null ? String(t.fee) : null,
              km,
              rowIndex: t.rowIndex ?? null,
              tableType: t.tableType ?? null,
              shiftDate: excelDate ?? null,
              status: finalStatus,
              vehicleId: isImportCancelled ? null : finalVehicleId,
            };

            const [updatedTask] = await tx
              .update(tasksTable)
              .set(updateValues)
              .where(eq(tasksTable.id, existing.id))
              .returning();

            if (updatedTask) {
              updatedTasks.push(enrichTaskInMemory(updatedTask));
              updatedCount++;
            } else {
              skipped++;
            }
          } else {
            // Task does not exist, insert it
            const insertValues = {
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
              shiftDate: excelDate ?? null,
              status,
              vehicleId: isImportCancelled ? null : vehicleId,
            };

            const [newTask] = await tx
              .insert(tasksTable)
              .values(insertValues)
              .onConflictDoNothing()
              .returning();

            if (newTask) {
              created.push(enrichTaskInMemory(newTask));
            } else {
              skipped++;
            }
          }
        } catch (err) {
          const { logger } = await import("../lib/logger");
          logger.error(
            { err, importKey: t.importKey },
            "Task import insert/update failed due to unexpected database error",
          );
          skipped++;
        }
      }
    });

    return res.json({
      created: created.length,
      updated: updatedCount,
      skipped,
      tasks: [...created, ...updatedTasks],
    });
  } catch (err: any) {
    console.error("[tasks/import] error:", err);
    (globalThis as any).lastImportError = {
      timestamp: new Date().toISOString(),
      message: err?.message ?? String(err),
      stack: err?.stack,
      name: err?.name,
      code: err?.code,
    };
    return res.status(500).json({
      error: "Görevler içe aktarılırken bir hata oluştu.",
      detail: err?.message ?? String(err),
    });
  }
});

// POST /tasks/batch-notify
router.post("/batch-notify", async (req, res) => {
  const parsed = BatchNotifyTasksBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

  const { taskIds } = parsed.data;
  if (taskIds.length === 0) {
    return res.json({ sent: 0, failed: 0, links: [] });
  }

  let sent = 0;
  let failed = 0;

  try {
    // 1. Fetch all requested tasks at once
    const tasks = await db
      .select()
      .from(tasksTable)
      .where(inArray(tasksTable.id, taskIds));

    // 2. Fetch all referenced vehicles at once
    const vehicleIds = [...new Set(tasks.map((t) => t.vehicleId).filter(Boolean))] as number[];
    const vehicles = vehicleIds.length > 0
      ? await db
          .select()
          .from(vehiclesTable)
          .where(inArray(vehiclesTable.id, vehicleIds))
      : [];
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

    const driverTasks = new Map<
      number,
      {
        phone: string;
        driverName: string;
        tasks: (typeof tasksTable.$inferSelect)[];
      }
    >();

    // 3. Match tasks with their vehicles
    for (const taskId of taskIds) {
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.status !== "draft" || !task.vehicleId) {
        failed++;
        continue;
      }

      const vehicle = vehicleMap.get(task.vehicleId);
      if (!vehicle) {
        failed++;
        continue;
      }

      if (!driverTasks.has(task.vehicleId)) {
        driverTasks.set(task.vehicleId, {
          phone: vehicle.phone,
          driverName: vehicle.driverName,
          tasks: [],
        });
      }
      driverTasks.get(task.vehicleId)!.tasks.push(task);
    }

    const links: Array<{ driverName: string; phone: string; url: string; taskIds: number[] }> = [];

    // 4. Update tasks, insert accounting records, and update vehicles in a single transaction
    await db.transaction(async (tx) => {
      // Get max queue position once
      const emptyVehicles = await tx
        .select({ qp: vehiclesTable.queuePosition })
        .from(vehiclesTable)
        .where(eq(vehiclesTable.status, "empty"));
      let maxPos = emptyVehicles.reduce((max, v) => Math.max(max, v.qp ?? 0), 0);

      for (const [vehicleId, data] of driverTasks.entries()) {
        // Sort tasks by scheduled time
        const sortedTasks = data.tasks.sort(
          (a, b) =>
            new Date(a.scheduledTime).getTime() -
            new Date(b.scheduledTime).getTime(),
        );

        let messageText = "";
        const updatedTaskIds = [];

        for (const task of sortedTasks) {
          const time = new Date(task.scheduledTime).toLocaleTimeString("tr-TR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC", // Use UTC for formatting since the DB timestamp overrides to UTC format
          });
          // Crew notes: use notes field (already contains crew info like "2CPT"), strip plate part
          const crew = task.notes
            ? task.notes.includes(" | Plaka:")
              ? task.notes.split(" | Plaka:")[0]
              : task.notes
            : "";
          // Direction label based on type
          const direction =
            task.type === "airport_run"
              ? "GİDER"
              : task.type === "hotel_pickup"
                ? "GELİR"
                : "EKSTRA";
          // Main location: hotel name
          const location =
            task.type === "airport_run"
              ? task.dropoffLocation
              : task.pickupLocation;
          // Flight code
          const flight = task.flightCode ?? "";

          // Format: "FMF 183   06:00   RİXOS   2CPT   GELİR"
          const parts = [flight, time, location, crew, direction].filter(Boolean);
          messageText += parts.join("   ") + "\n";
          updatedTaskIds.push(task.id);
        }

        messageText = messageText.trim();

        // Format phone for wa.me
        let phone = data.phone.replace(/\D/g, "");
        if (phone.startsWith("0")) phone = phone.substring(1);
        if (phone.length === 10) phone = "90" + phone;

        const url = `https://wa.me/${phone}?text=${encodeURIComponent(messageText)}`;
        links.push({
          driverName: data.driverName,
          phone: data.phone,
          url,
          taskIds: updatedTaskIds,
        });

        // 4A. Update status to completed for all tasks at once
        await tx
          .update(tasksTable)
          .set({ status: "completed" })
          .where(inArray(tasksTable.id, updatedTaskIds));

        // 4B. Insert accounting records in bulk
        const accountingInserts = [];
        const today = new Date().toISOString().split("T")[0];
        for (const task of sortedTasks) {
          if (task.fee) {
            accountingInserts.push({
              vehicleId,
              taskId: task.id,
              amount: task.fee,
              date: today,
            });
          }
        }

        if (accountingInserts.length > 0) {
          await tx
            .insert(accountingTable)
            .values(accountingInserts)
            .onConflictDoNothing();
        }

        // 4C. Move vehicle back to empty queue (FIFO — add to end)
        maxPos++;
        await tx
          .update(vehiclesTable)
          .set({ status: "empty", queuePosition: maxPos })
          .where(eq(vehiclesTable.id, vehicleId));

        sent += updatedTaskIds.length;
      }
    });

    return res.json({ sent, failed, links });
  } catch (err: any) {
    return res.status(500).json({ error: "Batch notification failed", details: err.message });
  }
});

// POST /tasks
router.post("/", async (req, res) => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

  let km = parsed.data.km != null ? String(parsed.data.km) : null;
  const pickup = parsed.data.pickupLocation?.trim();
  const dropoff = parsed.data.dropoffLocation?.trim();

  // Auto-fill from route preset if not provided (direction-independent)
  if (!km && pickup && dropoff) {
    try {
      const [match] = await db
        .select()
        .from(routePresetsTable)
        .where(
          or(
            and(
              eq(sql`lower(trim(${routePresetsTable.pickupLocation}))`, pickup.toLowerCase()),
              eq(sql`lower(trim(${routePresetsTable.dropoffLocation}))`, dropoff.toLowerCase())
            ),
            and(
              eq(sql`lower(trim(${routePresetsTable.pickupLocation}))`, dropoff.toLowerCase()),
              eq(sql`lower(trim(${routePresetsTable.dropoffLocation}))`, pickup.toLowerCase())
            )
          )
        )
        .limit(1);
      if (match) km = String(match.km);
    } catch (err) {
      console.error("Failed to lookup route preset during task creation:", err);
    }
  }

  const [task] = await db
    .insert(tasksTable)
    .values({
      ...parsed.data,
      scheduledTime: new Date(parsed.data.scheduledTime),
      fee: parsed.data.fee != null ? String(parsed.data.fee) : null,
      km,
    })
    .returning();

  // If KM is set, insert or update the route preset (direction-independent)
  if (km && Number(km) > 0 && pickup && dropoff) {
    try {
      const existing = await db
        .select()
        .from(routePresetsTable)
        .where(
          or(
            and(
              eq(sql`lower(trim(${routePresetsTable.pickupLocation}))`, pickup.toLowerCase()),
              eq(sql`lower(trim(${routePresetsTable.dropoffLocation}))`, dropoff.toLowerCase())
            ),
            and(
              eq(sql`lower(trim(${routePresetsTable.pickupLocation}))`, dropoff.toLowerCase()),
              eq(sql`lower(trim(${routePresetsTable.dropoffLocation}))`, pickup.toLowerCase())
            )
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(routePresetsTable)
          .set({ km: String(km) })
          .where(eq(routePresetsTable.id, existing[0].id));
      } else {
        await db
          .insert(routePresetsTable)
          .values({
            pickupLocation: pickup,
            dropoffLocation: dropoff,
            km: String(km),
          })
          .onConflictDoNothing();
      }
    } catch (err) {
      console.error("Failed to upsert route preset during task creation:", err);
    }
  }

  return res.status(201).json(await enrichTask(task));
});

// GET /tasks/:id
router.get("/:id", async (req, res) => {
  const parsed = GetTaskParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, parsed.data.id));
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
  if (parsed.data.scheduledTime)
    updateData.scheduledTime = new Date(parsed.data.scheduledTime);
  if (parsed.data.actualPickupTime)
    updateData.actualPickupTime = new Date(parsed.data.actualPickupTime);
  if (parsed.data.actualDropoffTime)
    updateData.actualDropoffTime = new Date(parsed.data.actualDropoffTime);
  if (parsed.data.fee != null) updateData.fee = String(parsed.data.fee);
  if (parsed.data.km != null) updateData.km = String(parsed.data.km);

  const [task] = await db
    .update(tasksTable)
    .set(updateData)
    .where(eq(tasksTable.id, idParsed.data.id))
    .returning();

  if (!task) return res.status(404).json({ error: "Task not found" });

  // If KM is set, insert or update the route preset (direction-independent)
  if (task.km && Number(task.km) > 0 && task.pickupLocation && task.dropoffLocation) {
    const pickup = task.pickupLocation.trim();
    const dropoff = task.dropoffLocation.trim();
    const km = task.km;

    try {
      const existing = await db
        .select()
        .from(routePresetsTable)
        .where(
          or(
            and(
              eq(sql`lower(trim(${routePresetsTable.pickupLocation}))`, pickup.toLowerCase()),
              eq(sql`lower(trim(${routePresetsTable.dropoffLocation}))`, dropoff.toLowerCase())
            ),
            and(
              eq(sql`lower(trim(${routePresetsTable.pickupLocation}))`, dropoff.toLowerCase()),
              eq(sql`lower(trim(${routePresetsTable.dropoffLocation}))`, pickup.toLowerCase())
            )
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(routePresetsTable)
          .set({ km: String(km) })
          .where(eq(routePresetsTable.id, existing[0].id));
      } else {
        await db
          .insert(routePresetsTable)
          .values({
            pickupLocation: pickup,
            dropoffLocation: dropoff,
            km: String(km),
          })
          .onConflictDoNothing();
      }
    } catch (err) {
      console.error("Failed to upsert route preset during task update:", err);
    }
  }

  // If task completed and has a fee, create accounting record
  if (parsed.data.status === "completed" && task.vehicleId && task.fee) {
    const today = new Date().toISOString().split("T")[0];
    await db
      .insert(accountingTable)
      .values({
        vehicleId: task.vehicleId,
        taskId: task.id,
        amount: task.fee,
        date: today,
      })
      .onConflictDoNothing();

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
