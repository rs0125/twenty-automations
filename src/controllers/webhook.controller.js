import { upsertOpportunity } from "../services/webhook.service.js";

export async function handleTwentyWebhook(req, res) {
  // Respond immediately — never make Twenty wait
  res.status(200).json({ received: true });

  // Fire-and-forget: upsert in background
  try {
    await upsertOpportunity(req.body);
  } catch (err) {
    console.error("[webhook] Failed to upsert opportunity:", err.message);
  }
}
