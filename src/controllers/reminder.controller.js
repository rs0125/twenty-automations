import { processReminder } from "../services/reminder.service.js";

const VALID_STEPS = ["1h", "1d", "3d"];

export async function sendReminder(req, res) {
  const { opportunityId, assigneeEmail, step } = req.body;

  if (!opportunityId || !assigneeEmail || !step) {
    return res.status(400).json({
      error: "Missing 'opportunityId', 'assigneeEmail', and/or 'step' field in request body",
    });
  }

  if (!VALID_STEPS.includes(step)) {
    return res.status(400).json({
      error: `Invalid step. Must be one of: ${VALID_STEPS.join(", ")}`,
    });
  }

  try {
    const result = await processReminder({ opportunityId, assigneeEmail, step });
    res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      error: status >= 500 ? "Internal server error" : err.message,
    });
  }
}
