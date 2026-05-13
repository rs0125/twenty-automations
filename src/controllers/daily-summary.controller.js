import { processDailySummary } from "../services/daily-summary.service.js";

const VALID_WINDOWS = ["morning", "evening"];

export async function sendDailySummary(req, res) {
  const { window: win } = req.body;

  if (!win) {
    return res.status(400).json({ error: "Missing 'window' field in request body ('morning' or 'evening')" });
  }

  if (!VALID_WINDOWS.includes(win)) {
    return res.status(400).json({ error: `Invalid window. Must be one of: ${VALID_WINDOWS.join(", ")}` });
  }

  try {
    const result = await processDailySummary({ window: win });
    res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      error: status >= 500 ? "Internal server error" : err.message,
    });
  }
}
