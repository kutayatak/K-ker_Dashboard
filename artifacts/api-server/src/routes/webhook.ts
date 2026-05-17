import { Router } from "express";
import { db, tasksTable, vehiclesTable, accountingTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

// POST /webhook/whatsapp
// Handles WhatsApp Interactive Button responses from drivers
router.post("/whatsapp", async (req, res) => {
  try {
    const body = req.body;

    // WhatsApp Cloud API webhook format
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message || message.type !== "interactive") {
      return res.status(200).json({ status: "ignored" });
    }

    const buttonReplyId: string = message?.interactive?.button_reply?.id ?? "";
    const from: string = message?.from ?? "";

    // Button IDs: "pickup_<taskId>" and "dropoff_<taskId>"
    const pickupMatch = buttonReplyId.match(/^pickup_(\d+)$/);
    const dropoffMatch = buttonReplyId.match(/^dropoff_(\d+)$/);

    if (pickupMatch) {
      const taskId = Number(pickupMatch[1]);
      const [task] = await db
        .update(tasksTable)
        .set({ status: "in_progress", actualPickupTime: new Date() })
        .where(eq(tasksTable.id, taskId))
        .returning();

      if (task?.vehicleId) {
        await db
          .update(vehiclesTable)
          .set({ status: "busy", queuePosition: null })
          .where(eq(vehiclesTable.id, task.vehicleId));

        // Send the "YOLCUYU BIRAKTIM" follow-up button
        const token = process.env.WHATSAPP_TOKEN;
        const phoneId = process.env.WHATSAPP_PHONE_ID;
        if (token && phoneId) {
          await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: from,
              type: "interactive",
              interactive: {
                type: "button",
                body: { text: "Yolcu aracta. Hedefe ulastiginda asagidaki butona basin." },
                action: {
                  buttons: [{ type: "reply", reply: { id: `dropoff_${taskId}`, title: "YOLCUYU BIRAKTIM" } }],
                },
              },
            }),
          });
        }
      }
    }

    if (dropoffMatch) {
      const taskId = Number(dropoffMatch[1]);
      const [task] = await db
        .update(tasksTable)
        .set({ status: "completed", actualDropoffTime: new Date() })
        .where(eq(tasksTable.id, taskId))
        .returning();

      if (task?.vehicleId) {
        // FIFO: add vehicle back to end of empty queue
        const all = await db
          .select({ qp: vehiclesTable.queuePosition })
          .from(vehiclesTable)
          .where(eq(vehiclesTable.status, "empty"));
        const maxPos = all.reduce((max, v) => Math.max(max, v.qp ?? 0), 0);

        await db
          .update(vehiclesTable)
          .set({ status: "empty", queuePosition: maxPos + 1 })
          .where(eq(vehiclesTable.id, task.vehicleId));

        // Create accounting record if fee exists
        if (task.fee) {
          const today = new Date().toISOString().split("T")[0];
          await db.insert(accountingTable).values({
            vehicleId: task.vehicleId,
            taskId: task.id,
            amount: task.fee,
            date: today,
          }).onConflictDoNothing();
        }
      }
    }

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    return res.status(200).json({ status: "error" });
  }
});

// GET /webhook/whatsapp — verification endpoint for Meta
router.get("/whatsapp", (req, res) => {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "dispatch_verify";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send("Forbidden");
});

export default router;
