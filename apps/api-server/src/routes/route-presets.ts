import { Router } from "express";
import { db, routePresetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.km != null) data.km = String(parsed.data.km);

  const [preset] = await db
    .update(routePresetsTable)
    .set(data)
    .where(eq(routePresetsTable.id, id))
    .returning();
  if (!preset) return res.status(404).json({ error: "Preset not found" });
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
