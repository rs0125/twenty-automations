import { Router } from "express";
import healthRoutes from "./health.routes.js";
import rfqRoutes from "./rfq.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/rfq", rfqRoutes);

export default router;
