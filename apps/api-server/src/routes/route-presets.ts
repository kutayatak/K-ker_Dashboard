import { Router } from "express";
import { db, routePresetsTable, tasksTable } from "@workspace/db";
import { eq, or, and, sql, gte, isNull, isNotNull, ne } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

const PresetBody = z.object({
  pickupLocation: z.string().min(1),
  dropoffLocation: z.string().min(1),
  km: z.number().positive(),
});

// GET /route-presets
router.get("/", async (_req, res) => {
  const presets = await db.select().from(routePresetsTable).orderBy(routePresetsTable.pickupLocation);
  return res.json(presets);
});

// POST /route-presets
router.post("/", async (req, res) => {
  const parsed = PresetBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

  const [preset] = await db
    .insert(routePresetsTable)
    .values({ ...parsed.data, km: String(parsed.data.km) })
    .returning();
  return res.status(201).json(preset);
});

// PATCH /route-presets/:id
router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = PresetBody.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

  const [oldPreset] = await db
    .select()
    .from(routePresetsTable)
    .where(eq(routePresetsTable.id, id))
    .limit(1);

  if (!oldPreset) return res.status(404).json({ error: "Preset not found" });

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.km != null) data.km = String(parsed.data.km);

  const [preset] = await db
    .update(routePresetsTable)
    .set(data)
    .where(eq(routePresetsTable.id, id))
    .returning();

  if (parsed.data.km != null && oldPreset.km !== data.km) {
    // Propagate the change to tasks with the same route (direction-independent) having the old KM
    const pickup = oldPreset.pickupLocation.trim();
    const dropoff = oldPreset.dropoffLocation.trim();
    try {
      await db
        .update(tasksTable)
        .set({ km: String(parsed.data.km) })
        .where(
          and(
            or(
              and(
                eq(sql`lower(trim(${tasksTable.pickupLocation}))`, pickup.toLowerCase()),
                eq(sql`lower(trim(${tasksTable.dropoffLocation}))`, dropoff.toLowerCase())
              ),
              and(
                eq(sql`lower(trim(${tasksTable.pickupLocation}))`, dropoff.toLowerCase()),
                eq(sql`lower(trim(${tasksTable.dropoffLocation}))`, pickup.toLowerCase())
              )
            ),
            eq(tasksTable.km, oldPreset.km)
          )
        );
    } catch (err) {
      console.error("Failed to propagate preset KM update to tasks:", err);
    }
  }

  return res.json(preset);
});

// POST /route-presets/learn-from-history
router.post("/learn-from-history", async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split("T")[0]; // YYYY-MM-DD

    // 1. Fetch tasks from the last 30 days that have km > 0
    const tasks = await db
      .select({
        pickupLocation: tasksTable.pickupLocation,
        dropoffLocation: tasksTable.dropoffLocation,
        km: tasksTable.km,
      })
      .from(tasksTable)
      .where(
        and(
          or(
            gte(tasksTable.shiftDate, dateStr),
            and(
              isNull(tasksTable.shiftDate),
              gte(tasksTable.scheduledTime, thirtyDaysAgo)
            )
          ),
          isNotNull(tasksTable.km),
          sql`${tasksTable.km}::numeric > 0`,
          ne(tasksTable.status, "cancelled")
        )
      );

    // 2. Group tasks by route and count frequency of KM values
    const routes = new Map<string, { pickup: string; dropoff: string; kmCounts: Map<number, number> }>();
    for (const t of tasks) {
      const pickup = (t.pickupLocation || "").trim();
      const dropoff = (t.dropoffLocation || "").trim();
      if (!pickup || !dropoff) continue;

      const pNorm = pickup.toLowerCase();
      const dNorm = dropoff.toLowerCase();
      const routeKey = pNorm < dNorm ? `${pNorm}|||${dNorm}` : `${dNorm}|||${pNorm}`;

      if (!routes.has(routeKey)) {
        routes.set(routeKey, {
          pickup: pNorm < dNorm ? pickup : dropoff,
          dropoff: pNorm < dNorm ? dropoff : pickup,
          kmCounts: new Map<number, number>(),
        });
      }
      const route = routes.get(routeKey)!;
      const kmNum = Number(t.km);
      if (!isNaN(kmNum) && kmNum > 0) {
        route.kmCounts.set(kmNum, (route.kmCounts.get(kmNum) || 0) + 1);
      }
    }

    // 3. Fetch existing presets to avoid duplicate insertions
    const existingPresets = await db.select().from(routePresetsTable);
    const presetMap = new Map<string, any>();
    for (const p of existingPresets) {
      const pNorm = p.pickupLocation.trim().toLowerCase();
      const dNorm = p.dropoffLocation.trim().toLowerCase();
      const routeKey = pNorm < dNorm ? `${pNorm}|||${dNorm}` : `${dNorm}|||${pNorm}`;
      presetMap.set(routeKey, p);
    }

    let createdCount = 0;
    let updatedCount = 0;

    await db.transaction(async (tx) => {
      // 4. For each route, find the most common KM and insert or update preset
      for (const [routeKey, route] of routes.entries()) {
        let bestKm = 0;
        let maxCount = 0;
        for (const [kmVal, count] of route.kmCounts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            bestKm = kmVal;
          }
        }

        if (bestKm <= 0) continue;
        const bestKmStr = String(bestKm);

        const existing = presetMap.get(routeKey);
        if (existing) {
          // Update preset if KM changed
          if (existing.km !== bestKmStr) {
            await tx
              .update(routePresetsTable)
              .set({ km: bestKmStr })
              .where(eq(routePresetsTable.id, existing.id));
            updatedCount++;
          }
        } else {
          // Create new preset
          await tx.insert(routePresetsTable).values({
            pickupLocation: route.pickup,
            dropoffLocation: route.dropoff,
            km: bestKmStr,
          });
          createdCount++;
        }
      }

      // 5. Propagate the presets to tasks missing KMs
      const allPresets = await tx.select().from(routePresetsTable);
      for (const preset of allPresets) {
        const pickup = preset.pickupLocation.trim();
        const dropoff = preset.dropoffLocation.trim();
        await tx
          .update(tasksTable)
          .set({ km: preset.km })
          .where(
            and(
              or(
                and(
                  eq(sql`lower(trim(${tasksTable.pickupLocation}))`, pickup.toLowerCase()),
                  eq(sql`lower(trim(${tasksTable.dropoffLocation}))`, dropoff.toLowerCase())
                ),
                and(
                  eq(sql`lower(trim(${tasksTable.pickupLocation}))`, dropoff.toLowerCase()),
                  eq(sql`lower(trim(${tasksTable.dropoffLocation}))`, pickup.toLowerCase())
                )
              ),
              or(
                isNull(tasksTable.km),
                eq(tasksTable.km, "0")
              )
            )
          );
      }
    });

    return res.json({ ok: true, created: createdCount, updated: updatedCount });
  } catch (err: any) {
    console.error("[route-presets/learn] error:", err);
    return res.status(500).json({ error: "Failed to learn KMs from history", details: err?.message ?? String(err) });
  }
});

// DELETE /route-presets/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(routePresetsTable).where(eq(routePresetsTable.id, id));
  return res.status(204).send();
});

export default router;
