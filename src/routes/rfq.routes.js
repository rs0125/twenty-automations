import { Router } from "express";
import { processRfq } from "../controllers/rfq.controller.js";

const router = Router();

router.post("/", processRfq);

export default router;
