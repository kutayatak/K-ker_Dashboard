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

  const created = [];
  let skipped = 0;

  for (const t of parsed.data.tasks) {
    try {
      const [task] = await db
        .insert(tasksTable)
        .values({
          ...t,
          status: "draft",
          scheduledTime: new Date(t.scheduledTime),
          fee: t.fee != null ? String(t.fee) : null,
        })
        .returning();
      created.push(await enrichTask(task));
    } catch {
      skipped++;
    }
  }

  return res.json({ created: created.length, skipped, tasks: created });
});

// POST /tasks/batch-notify
router.post("/batch-notify", async (req, res) => {
  const parsed = BatchNotifyTasksBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

  let sent = 0;
  let failed = 0;

  for (const taskId of parsed.data.taskIds) {
    const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
    if (!task || task.status !== "draft" || !task.vehicleId) {
      failed++;
      continue;
    }

    const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, task.vehicleId));
    if (!vehicle) { failed++; continue; }

    // Format: [SAAT] | [UÇUŞ KODU] | [KİŞİ SAYISI] | [NEREDEN] -> [NEREYE]
    const time = new Date(task.scheduledTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const message = `${time} | ${task.flightCode ?? "-"} | ${task.passengerCount} kişi | ${task.pickupLocation} -> ${task.dropoffLocation}`;

    // WhatsApp Business API integration point
    // If WHATSAPP_TOKEN and WHATSAPP_PHONE_ID are set, send the message
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    if (token && phoneId) {
      try {
        const phone = vehicle.phone.replace(/\D/g, "");
        const payload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: message },
            action: {
              buttons: [{ type: "reply", reply: { id: `pickup_${task.id}`, title: "YOLCUYU ALDIM" } }],
            },
          },
        };

        await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        await db.update(tasksTable).set({ status: "assigned" }).where(eq(tasksTable.id, taskId));
        sent++;
      } catch {
        failed++;
      }
    } else {
      // Dev mode: just mark as assigned
      await db.update(tasksTable).set({ status: "assigned" }).where(eq(tasksTable.id, taskId));
      sent++;
    }
  }

  return res.json({ sent, failed });
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
