import { Router } from "express";
import { db, accountingTable, vehiclesTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { ListAccountingRecordsQueryParams } from "@workspace/api-zod";

const router = Router();

// GET /accounting
router.get("/", async (req, res) => {
  const parsed = ListAccountingRecordsQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query params" });

  const { vehicleId, startDate, endDate } = parsed.data;
  const conditions = [];

  if (vehicleId) conditions.push(eq(accountingTable.vehicleId, vehicleId));
  if (startDate) conditions.push(gte(accountingTable.date, startDate));
  if (endDate) conditions.push(lte(accountingTable.date, endDate));

  const records = conditions.length
    ? await db.select().from(accountingTable).where(and(...conditions))
    : await db.select().from(accountingTable);

  const vehicles = await db.select({ id: vehiclesTable.id, name: vehiclesTable.name }).from(vehiclesTable);
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v.name]));

  return res.json(
    records.map((r) => ({
      ...r,
      amount: Number(r.amount),
      vehicleName: vehicleMap.get(r.vehicleId) ?? null,
    }))
  );
});

// GET /accounting/summary
router.get("/summary", async (_req, res) => {
  const result = await db
    .select({
      vehicleId: accountingTable.vehicleId,
      totalRevenue: sql<number>`SUM(CAST(${accountingTable.amount} AS NUMERIC))`,
      tripCount: sql<number>`COUNT(*)`,
    })
    .from(accountingTable)
    .groupBy(accountingTable.vehicleId);

  const vehicles = await db
    .select({ id: vehiclesTable.id, name: vehiclesTable.name, driverName: vehiclesTable.driverName })
    .from(vehiclesTable);
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

  return res.json(
    result.map((r) => ({
      vehicleId: r.vehicleId,
      vehicleName: vehicleMap.get(r.vehicleId)?.name ?? "Unknown",
      driverName: vehicleMap.get(r.vehicleId)?.driverName ?? "",
      totalRevenue: Number(r.totalRevenue),
      tripCount: Number(r.tripCount),
    }))
  );
});

export default router;
