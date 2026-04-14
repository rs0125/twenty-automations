import { Router } from "express";
import { sendReminder } from "../controllers/reminder.controller.js";

const router = Router();

router.post("/", sendReminder);

export default router;
