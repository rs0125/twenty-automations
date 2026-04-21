import { Router } from "express";
import { sendReminder } from "../controllers/reminder.controller.js";

const router = Router();

router.use((req, res, next) => {
  const expected = process.env.REMINDER_SECRET;
  if (!expected) {
    console.error("[reminder] REMINDER_SECRET not set — refusing all requests");
    return res.status(503).json({ error: "Server not configured" });
  }
  if (req.header("x-auth") !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

router.post("/", sendReminder);

export default router;
