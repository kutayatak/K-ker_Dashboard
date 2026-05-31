import { db, tasksTable } from "../packages/db"; // Let's check path
import { desc } from "drizzle-orm";

async function main() {
  const tasks = await db.select().from(tasksTable).orderBy(desc(tasksTable.id)).limit(20);
  console.log("LAST 20 TASKS IN DB:");
  console.log(JSON.stringify(tasks, null, 2));
  process.exit(0);
}

main().catch(console.error);
