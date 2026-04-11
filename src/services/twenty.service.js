const MICROS_MULTIPLIER = 1_000_000n;

function toMicros(amountValue) {
  const normalizedAmount = String(amountValue).replace(/,/g, "").trim();

  if (!/^-?\d+$/.test(normalizedAmount)) {
    return amountValue;
  }

  return String(BigInt(normalizedAmount) * MICROS_MULTIPLIER);
}

export async function createOpportunityFromData(data) {
  const baseUrl = process.env.TWENTY_CRM_BASE_URL;
  const apiKey = process.env.TWENTY_CRM_API_KEY;

  const payload = { ...data };

  // Convert amount to micros
  if (payload.amount?.amountMicros != null) {
    payload.amount = { ...payload.amount, amountMicros: toMicros(payload.amount.amountMicros) };
  }

  // Strip empty assignedTo
  if (payload.assignedTo === "" || payload.assignedTo == null) {
    delete payload.assignedTo;
  }

  const response = await fetch(`${baseUrl}/rest/opportunities`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json();

  if (!response.ok) {
    const error = new Error(`Twenty CRM API error: ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}
