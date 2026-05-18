import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vehiclesRouter from "./vehicles";
import tasksRouter from "./tasks";
import accountingRouter from "./accounting";
import webhookRouter from "./webhook";
import flightsRouter from "./flights";
import excelRouter from "./excel";
import routePresetsRouter from "./route-presets";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/vehicles", vehiclesRouter);
router.use("/tasks", tasksRouter);
router.use("/accounting", accountingRouter);
router.use("/webhook", webhookRouter);
router.use("/flights", flightsRouter);
router.use("/excel", excelRouter);
router.use("/route-presets", routePresetsRouter);

export default router;
