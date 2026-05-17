import { Router } from "express";
import { db, vehiclesTable } from "@workspace/db";
import { eq, asc, isNotNull } from "drizzle-orm";
import {
  ListVehiclesQueryParams,
  CreateVehicleBody,
  GetVehicleParams,
  UpdateVehicleBody,
  UpdateVehicleParams,
  DeleteVehicleParams,
} from "@workspace/api-zod";

const router = Router();

// GET /vehicles
router.get("/", async (req, res) => {
  const parsed = ListVehiclesQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query params" });

  const { type, status } = parsed.data;
  let query = db.select().from(vehiclesTable).$dynamic();

  const conditions = [];
  if (type) conditions.push(eq(vehiclesTable.type, type));
  if (status) conditions.push(eq(vehiclesTable.status, status));

  const vehicles = conditions.length
    ? await db.select().from(vehiclesTable).where(conditions.length === 1 ? conditions[0] : conditions.reduce((a, b) => a && b))
    : await db.select().from(vehiclesTable).orderBy(asc(vehiclesTable.createdAt));

  return res.json(vehicles);
});

// GET /vehicles/queue
router.get("/queue", async (_req, res) => {
  const queue = await db
    .select()
    .from(vehiclesTable)
    .where(eq(vehiclesTable.status, "empty"))
    .orderBy(asc(vehiclesTable.queuePosition));
  return res.json(queue);
});

// POST /vehicles
router.post("/", async (req, res) => {
  const parsed = CreateVehicleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error });

  // Get max queue position
  const all = await db.select({ qp: vehiclesTable.queuePosition }).from(vehiclesTable).where(isNotNull(vehiclesTable.queuePosition));
  const maxPos = all.reduce((max, v) => Math.max(max, v.qp ?? 0), 0);

  const [vehicle] = await db
    .insert(vehiclesTable)
    .values({ ...parsed.data, status: "empty", queuePosition: maxPos + 1 })
    .returning();

  return res.status(201).json(vehicle);
});

// GET /vehicles/:id
router.get("/:id", async (req, res) => {
  const parsed = GetVehicleParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

  const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, parsed.data.id));
  if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

  return res.json(vehicle);
});

// PATCH /vehicles/:id
router.patch("/:id", async (req, res) => {
  const idParsed = UpdateVehicleParams.safeParse({ id: Number(req.params.id) });
  if (!idParsed.success) return res.status(400).json({ error: "Invalid id" });

  const parsed = UpdateVehicleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

  const [vehicle] = await db
    .update(vehiclesTable)
    .set(parsed.data)
    .where(eq(vehiclesTable.id, idParsed.data.id))
    .returning();

  if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

  return res.json(vehicle);
});

// DELETE /vehicles/:id
router.delete("/:id", async (req, res) => {
  const parsed = DeleteVehicleParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

  await db.delete(vehiclesTable).where(eq(vehiclesTable.id, parsed.data.id));
  return res.status(204).send();
});

export default router;
