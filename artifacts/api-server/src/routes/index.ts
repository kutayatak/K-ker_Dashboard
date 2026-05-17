import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vehiclesRouter from "./vehicles";
import tasksRouter from "./tasks";
import accountingRouter from "./accounting";
import webhookRouter from "./webhook";
import flightsRouter from "./flights";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/vehicles", vehiclesRouter);
router.use("/tasks", tasksRouter);
router.use("/accounting", accountingRouter);
router.use("/webhook", webhookRouter);
router.use("/flights", flightsRouter);

export default router;
