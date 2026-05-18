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

// AirLabs API call
async function fetchFlightFromApi(flightCode: string): Promise<{
  status: string;
  delayMinutes: number;
  estimatedArrival: Date | null;
} | null> {
  const apiKey = process.env.AIRLABS_API_KEY;
  if (!apiKey) return null;

  try {
    const iata = flightCode.replace(/\s+/g, "").toUpperCase();
    const url = `https://airlabs.co/api/v9/schedules?flight_iata=${iata}&api_key=${apiKey}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;

    const json = (await resp.json()) as any;
    const flight = json?.response?.[0]; // AirLabs returns an array in "response"
    if (!flight) return null;

    const status: string = flight.status ?? "unknown";
    const delayMinutes: number = flight.arr_delay ?? flight.delay ?? 0;
    
    // AirLabs returns times like "2023-11-15 15:30" or ISO. We parse it if available.
    const estimatedStr: string | null = flight.arr_estimated ?? flight.arr_time ?? null;
    const estimatedArrival = estimatedStr ? new Date(estimatedStr) : null;

    return { status, delayMinutes: Number(delayMinutes) || 0, estimatedArrival };
  } catch {
    return null;
  }
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

    const flightData = await fetchFlightFromApi(code);

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
  return { checkedFlights: tasks.length, updatedTasks: updates.length, simulationMode: false, updates };
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
    apiConfigured: !!process.env.AIRLABS_API_KEY,
    simulationMode: false,
    lastCheckedAt: trackerState.lastCheckedAt?.toISOString() ?? null,
    autoCheckEnabled: trackerState.autoCheckEnabled,
    checkIntervalMinutes: trackerState.checkIntervalMinutes,
  });
});

export default router;
