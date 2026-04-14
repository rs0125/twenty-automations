import { sendMail } from "../services/email.service.js";

export async function sendEmail(req, res) {
  const { to, text, timePeriod } = req.body;

  const validPeriods = ["1 hour", "1 day", "3 days"];

  if (!to || !text || !timePeriod) {
    return res
      .status(400)
      .json({ error: "Missing 'to', 'text', and/or 'timePeriod' field in request body" });
  }

  if (!validPeriods.includes(timePeriod)) {
    return res
      .status(400)
      .json({ error: `Invalid timePeriod. Must be one of: ${validPeriods.join(", ")}` });
  }

  try {
    const result = await sendMail({ to, text, timePeriod });
    res.status(200).json({ message: "Email sent", ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      error: status >= 500 ? "Internal server error" : err.message,
    });
  }
}
