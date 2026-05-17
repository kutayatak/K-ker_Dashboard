import { Router } from "express";
import { db, tasksTable } from "@workspace/db";
import { and, isNotNull, sql } from "drizzle-orm";

const router = Router();

// In-memory tracker state (persists across requests in same process)
const trackerState = {
  lastCheckedAt: null as Date | null,
  autoCheckEnabled: true,
  checkIntervalMinutes: 5,
  intervalHandle: null as ReturnType<typeof setInterval> | null,
};

// AviationStack API call
async function fetchFlightFromApi(flightCode: string): Promise<{
  status: string;
  delayMinutes: number;
  estimatedArrival: Date | null;
} | null> {
  const apiKey = process.env.AVIATIONSTACK_KEY;
  if (!apiKey) return null;

  try {
    const iata = flightCode.replace(/\s+/g, "").toUpperCase();
    const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${iata}&limit=1`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;

    const json = (await resp.json()) as any;
    const flight = json?.data?.[0];
    if (!flight) return null;

    const status: string = flight.flight_status ?? "unknown";
    const delayMinutes: number = flight.arrival?.delay ?? 0;
    const estimatedStr: string | null = flight.arrival?.estimated ?? flight.arrival?.scheduled ?? null;
    const estimatedArrival = estimatedStr ? new Date(estimatedStr) : null;

    return { status, delayMinutes: Number(delayMinutes) || 0, estimatedArrival };
  } catch {
    return null;
  }
}

// Simulation mode: randomly add 0-45 min delays to some flights
function simulateFlightData(flightCode: string): {
  status: string;
  delayMinutes: number;
  estimatedArrival: Date | null;
} {
  // Use flight code as a seed for deterministic-ish simulation
  const seed = flightCode.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const delayMinutes = seed % 3 === 0 ? (seed % 45) + 10 : 0; // ~1/3 flights delayed
  const status = delayMinutes > 0 ? "delayed" : "active";
  return { status, delayMinutes, estimatedArrival: null };
}

async function runFlightCheck() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get today's tasks that have a flight code and aren't completed/cancelled
  const tasks = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        isNotNull(tasksTable.flightCode),
        sql`${tasksTable.scheduledTime} >= ${today} AND ${tasksTable.scheduledTime} < ${tomorrow}`,
        sql`${tasksTable.status} NOT IN ('completed', 'cancelled')`
      )
    );

  const simulationMode = !process.env.AVIATIONSTACK_KEY;
  const updates: {
    taskId: number;
    flightCode: string;
    previousTime: Date;
    updatedTime: Date;
    delayMinutes: number;
    flightStatus: string;
  }[] = [];

  for (const task of tasks) {
    const code = task.flightCode!;

    const flightData = simulationMode
      ? simulateFlightData(code)
      : await fetchFlightFromApi(code);

    if (!flightData || flightData.delayMinutes <= 0) continue;

    const previousTime = new Date(task.scheduledTime);
    let updatedTime: Date;

    if (flightData.estimatedArrival) {
      updatedTime = flightData.estimatedArrival;
    } else {
      updatedTime = new Date(previousTime.getTime() + flightData.delayMinutes * 60 * 1000);
    }

    // Only update if time actually changed by more than 1 minute
    if (Math.abs(updatedTime.getTime() - previousTime.getTime()) < 60000) continue;

    await db
      .update(tasksTable)
      .set({ scheduledTime: updatedTime })
      .where(sql`${tasksTable.id} = ${task.id}`);

    updates.push({
      taskId: task.id,
      flightCode: code,
      previousTime,
      updatedTime,
      delayMinutes: flightData.delayMinutes,
      flightStatus: flightData.status,
    });
  }

  trackerState.lastCheckedAt = new Date();
  return { checkedFlights: tasks.length, updatedTasks: updates.length, simulationMode, updates };
}

// Start auto-polling when module loads
function startAutoCheck() {
  if (trackerState.intervalHandle) clearInterval(trackerState.intervalHandle);
  trackerState.intervalHandle = setInterval(
    async () => {
      if (!trackerState.autoCheckEnabled) return;
      try {
        await runFlightCheck();
        console.log(`[FlightTracker] Auto-check complete at ${new Date().toISOString()}`);
      } catch (err) {
        console.error("[FlightTracker] Auto-check error:", err);
      }
    },
    trackerState.checkIntervalMinutes * 60 * 1000
  );
}

startAutoCheck();

// POST /flights/check — manual trigger
router.post("/check", async (_req, res) => {
  try {
    const result = await runFlightCheck();
    return res.json({
      ...result,
      checkedAt: trackerState.lastCheckedAt!.toISOString(),
      updates: result.updates.map((u) => ({
        ...u,
        previousTime: u.previousTime.toISOString(),
        updatedTime: u.updatedTime.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[FlightTracker] Manual check error:", err);
    return res.status(500).json({ error: "Flight check failed" });
  }
});

// GET /flights/status
router.get("/status", (_req, res) => {
  return res.json({
    apiConfigured: !!process.env.AVIATIONSTACK_KEY,
    simulationMode: !process.env.AVIATIONSTACK_KEY,
    lastCheckedAt: trackerState.lastCheckedAt?.toISOString() ?? null,
    autoCheckEnabled: trackerState.autoCheckEnabled,
    checkIntervalMinutes: trackerState.checkIntervalMinutes,
  });
});

export default router;
