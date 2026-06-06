import { Router } from "express";
import { db, routePresetsTable, tasksTable } from "@workspace/db";
import { eq, or, and, sql } from "drizzle-orm";
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

// DELETE /route-presets/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(routePresetsTable).where(eq(routePresetsTable.id, id));
  return res.status(204).send();
});

export default router;
