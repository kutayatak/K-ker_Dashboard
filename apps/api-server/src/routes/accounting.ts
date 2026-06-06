import { Router } from "express";
import { db, accountingTable, vehiclesTable } from "@workspace/db";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { ListAccountingRecordsQueryParams } from "@workspace/api-zod";

const router = Router();

// GET /accounting
router.get("/", async (req, res) => {
  const parsed = ListAccountingRecordsQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query params" });

  const { vehicleId, startDate, endDate } = parsed.data;
  const conditions = [];

  if (vehicleId) conditions.push(eq(accountingTable.vehicleId, vehicleId));
  if (startDate) conditions.push(gte(accountingTable.date, startDate.toISOString().split("T")[0]));
  if (endDate) conditions.push(lte(accountingTable.date, endDate.toISOString().split("T")[0]));

  try {
    const records = await db
      .select({
        id: accountingTable.id,
        vehicleId: accountingTable.vehicleId,
        vehicleName: vehiclesTable.name,
        taskId: accountingTable.taskId,
        amount: accountingTable.amount,
        date: accountingTable.date,
        notes: accountingTable.notes,
        createdAt: accountingTable.createdAt,
      })
      .from(accountingTable)
      .leftJoin(vehiclesTable, eq(accountingTable.vehicleId, vehiclesTable.id))
      .where(conditions.length ? and(...conditions) : undefined);

    return res.json(
      records.map((r) => ({
        ...r,
        amount: Number(r.amount),
        vehicleName: r.vehicleName ?? null,
      }))
    );
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to load accounting records", details: err.message });
  }
});

// GET /accounting/summary
router.get("/summary", async (_req, res) => {
  try {
    const result = await db
      .select({
        vehicleId: accountingTable.vehicleId,
        vehicleName: vehiclesTable.name,
        driverName: vehiclesTable.driverName,
        totalRevenue: sql<number>`SUM(CAST(${accountingTable.amount} AS NUMERIC))`,
        tripCount: sql<number>`COUNT(*)`,
      })
      .from(accountingTable)
      .leftJoin(vehiclesTable, eq(accountingTable.vehicleId, vehiclesTable.id))
      .groupBy(accountingTable.vehicleId, vehiclesTable.name, vehiclesTable.driverName);

    return res.json(
      result.map((r) => ({
        vehicleId: r.vehicleId,
        vehicleName: r.vehicleName ?? "Unknown",
        driverName: r.driverName ?? "",
        totalRevenue: Number(r.totalRevenue),
        tripCount: Number(r.tripCount),
      }))
    );
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to load accounting summary", details: err.message });
  }
});

export default router;
