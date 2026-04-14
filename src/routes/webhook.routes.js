import { Router } from "express";
import { handleTwentyWebhook } from "../controllers/webhook.controller.js";

const router = Router();

router.post("/", handleTwentyWebhook);

export default router;
