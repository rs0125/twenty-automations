import { Router } from "express";
import { sendDailySummary } from "../controllers/daily-summary.controller.js";

const router = Router();

// Same X-Auth guard as /send-reminder
router.use((req, res, next) => {
  const expected = process.env.REMINDER_SECRET;
  if (!expected) {
    console.error("[daily-summary] REMINDER_SECRET not set — refusing all requests");
    return res.status(503).json({ error: "Server not configured" });
  }
  if (req.header("x-auth") !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

router.post("/", sendDailySummary);

export default router;
