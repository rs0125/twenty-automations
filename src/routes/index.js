import { Router } from "express";
import healthRoutes from "./health.routes.js";
import rfqRoutes from "./rfq.routes.js";
import emailRoutes from "./email.routes.js";
import webhookRoutes from "./webhook.routes.js";
import reminderRoutes from "./reminder.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/rfq", rfqRoutes);
router.use("/email", emailRoutes);
router.use("/webhook/twenty", webhookRoutes);
router.use("/send-reminder", reminderRoutes);

export default router;
