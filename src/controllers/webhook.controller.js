import { upsertOpportunity } from "../services/webhook.service.js";

// Twenty CRM posts JSON bodies with Content-Type: application/x-www-form-urlencoded
// (upstream bug). Express's urlencoded parser then treats the entire JSON string
// as a single form-field name with empty value, producing { '{...json...}': '' }.
// On top of that, Twenty pretty-prints the JSON — multi-line string values
// (e.g. an opportunity's description) contain literal LF/CR/TAB which JSON
// requires to be escaped. We recover by escaping those control characters
// before parsing.
function recoverBody(body) {
  if (!body || typeof body !== "object") return body;
  const keys = Object.keys(body);
  if (keys.length !== 1) return body;
  const onlyKey = keys[0];
  const onlyVal = body[onlyKey];
  if (onlyVal !== "" && onlyVal !== null && onlyVal !== undefined) return body;
  const trimmed = onlyKey.trim();
  if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) return body;

  const sanitized = sanitizeJsonControls(trimmed);

  try {
    return JSON.parse(sanitized);
  } catch {
    return body;
  }
}

// Escape literal control chars that appear unescaped inside JSON string
// literals. Tracks string state so control chars between tokens (insignificant
// whitespace) are left alone.
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

export async function handleTwentyWebhook(req, res) {
  // Respond immediately — never make Twenty wait
  res.status(200).json({ received: true });

  const body = recoverBody(req.body);

  // Fire-and-forget: upsert in background
  try {
    await upsertOpportunity(body);
  } catch (err) {
    console.error("[webhook] Failed to upsert opportunity:", err.message);
  }
}
