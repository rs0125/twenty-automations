import { upsertOpportunity } from "../services/webhook.service.js";

// Twenty CRM posts JSON bodies but with Content-Type: application/x-www-form-urlencoded
// (upstream bug). On top of that it pretty-prints the JSON, so multi-line string values
// (e.g. an opportunity's description) contain literal LF/CR/TAB that strict JSON rejects.
//
// app.js mounts express.text({ type: "*/*" }) on this route, so req.body is the raw
// request string. We sanitize the control chars and JSON.parse it directly — this
// sidesteps the urlencoded parser entirely, which previously broke whenever a field
// contained '&' or '=' (split into multiple form keys) or a newline (parse failure).

// Escape literal control chars that appear unescaped inside JSON string literals.
// Tracks string state so control chars between tokens (insignificant whitespace)
// are left alone.
function sanitizeJsonControls(s) {
  let out = "";
  let inStr = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      out += c;
      escape = false;
      continue;
    }
    if (c === "\\" && inStr) {
      out += c;
      escape = true;
      continue;
    }
    if (c === '"') {
      out += c;
      inStr = !inStr;
      continue;
    }
    if (inStr) {
      if (c === "\n") { out += "\\n"; continue; }
      if (c === "\r") { out += "\\r"; continue; }
      if (c === "\t") { out += "\\t"; continue; }
      const code = c.charCodeAt(0);
      if (code < 0x20) { out += "\\u" + code.toString(16).padStart(4, "0"); continue; }
    }
    out += c;
  }
  return out;
}

// Parse the raw webhook body into an object. Throws on malformed input so the
// caller can log the raw payload rather than silently dropping it.
function parseWebhookBody(raw) {
  // Defensive: if some upstream parser already produced an object, use it as-is.
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("empty or non-string body");
  }
  return JSON.parse(sanitizeJsonControls(raw.trim()));
}

export async function handleTwentyWebhook(req, res) {
  // Respond immediately — never make Twenty wait
  res.status(200).json({ received: true });

  let body;
  try {
    body = parseWebhookBody(req.body);
  } catch (err) {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    console.error(`[webhook] Failed to parse body: ${err.message} — raw=${raw}`);
    return;
  }

  // Fire-and-forget: upsert in background
  try {
    await upsertOpportunity(body);
  } catch (err) {
    console.error("[webhook] Failed to upsert opportunity:", err.message);
  }
}
