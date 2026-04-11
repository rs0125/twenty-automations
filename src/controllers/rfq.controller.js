import { parseRfq } from "../services/rfq.service.js";
import { createOpportunityFromData } from "../services/twenty.service.js";

export async function processRfq(req, res) {
  const { rfq } = req.body;

  if (!rfq) {
    return res.status(400).json({ error: "Missing 'rfq' field in request body" });
  }

  try {
    const parsed = await parseRfq(rfq);
    const result = await createOpportunityFromData(parsed);
    res.status(201).json({ parsed, crm: result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      error: status >= 500 ? "Internal server error" : err.message,
    });
  }
}
