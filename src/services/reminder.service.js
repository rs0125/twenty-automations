import prisma from "../lib/prisma.js";
import { sendMail } from "./email.service.js";

const STEP_CONFIG = {
  "1h": { sentCol: "reminder1hSent", failedCol: "reminder1hFailed", timePeriod: "1 hour" },
  "1d": { sentCol: "reminder1dSent", failedCol: "reminder1dFailed", timePeriod: "1 day" },
  "3d": { sentCol: "reminder3dSent", failedCol: "reminder3dFailed", timePeriod: "3 days" },
};

const DASHBOARD_URL = "https://dashboard.wareongo.com";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWithRetry(args, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendMail(args);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await sleep(1000 * 2 ** attempt); // 2s, 4s, 8s
    }
  }
}

// Escape user-supplied strings before embedding in HTML.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Pull a value from the raw webhook payload, trimming and treating
// empty/missing as absent. Returns null if nothing usable.
function readField(data, key) {
  if (!data) return null;
  const v = data[key];
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

// Build ordered list of { label, value } rows, skipping anything missing.
function collectFields(data, opportunityId) {
  const pairs = [
    ["Deal",             readField(data, "deal_name")],
    ["Company",          readField(data, "company")],
    ["POC Name",         readField(data, "POC Name")],
    ["POC Phone Number", readField(data, "POC Phone Number")],
    ["Assigned To",      readField(data, "assigned_to")],
    ["Stage",            readField(data, "stage")],
    ["Description",      readField(data, "description")],
    ["Created At",       readField(data, "created_at")],
    ["Last Updated",     readField(data, "last_updated")],
    ["Opportunity ID",   opportunityId],
  ];
  return pairs.filter(([, v]) => v !== null);
}

function buildHtmlBody({ fields, timePeriod }) {
  const rows = fields
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 16px 8px 0; color:#6b7280; font-weight:500; vertical-align:top; white-space:nowrap;">${escapeHtml(label)}</td>
          <td style="padding:8px 0; color:#111827; vertical-align:top;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0; padding:24px; background:#f9fafb; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#111827;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px;">
      <tr>
        <td style="padding:24px 32px; border-bottom:1px solid #e5e7eb;">
          <h2 style="margin:0 0 4px; font-size:18px; font-weight:600; color:#111827;">RFQ Reminder</h2>
          <p style="margin:0; font-size:14px; color:#6b7280;">
            This opportunity has been in <strong>RFQ Received</strong> for over ${escapeHtml(timePeriod)} without activity.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; font-size:14px; border-collapse:collapse;">
            ${rows}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px 24px; border-top:1px solid #e5e7eb; font-size:14px;">
          <a href="${DASHBOARD_URL}" style="color:#2563eb; text-decoration:none;">Open dashboard &rarr;</a>
        </td>
      </tr>
    </table>
    <p style="max-width:600px; margin:16px auto 0; font-size:12px; color:#9ca3af; text-align:center;">
      Automated reminder from Wareongo CRM
    </p>
  </body>
</html>`;
}

function buildTextBody({ fields, timePeriod }) {
  const lines = fields.map(([label, value]) => `${label}: ${value}`).join("\n");
  return [
    `This opportunity has been in RFQ Received for over ${timePeriod} without activity.`,
    "",
    lines,
    "",
    `Dashboard: ${DASHBOARD_URL}`,
    "",
    "— Wareongo CRM",
  ].join("\n");
}

export async function processReminder({ opportunityId, assigneeEmail, step }) {
  const config = STEP_CONFIG[step];
  if (!config) throw new Error(`Invalid step: ${step}`);

  const opportunity = await prisma.opportunity.findUnique({
    where: { opportunityId },
  });

  if (!opportunity) {
    const err = new Error(`Opportunity ${opportunityId} not found`);
    err.status = 404;
    throw err;
  }

  // Idempotency guard: if the reconciler has already marked this step sent,
  // don't re-send even if the cron somehow re-queued this row.
  if (opportunity[config.sentCol]) {
    return { sent: false, skipped: true };
  }

  const fields = collectFields(opportunity.data, opportunityId);
  const html = buildHtmlBody({ fields, timePeriod: config.timePeriod });
  const text = buildTextBody({ fields, timePeriod: config.timePeriod });
  const dealName = opportunity.data?.deal_name || opportunityId;
  const subject = `[${config.timePeriod}] RFQ Reminder — ${dealName}`;

  // Send and let the caller's HTTP status drive the reconciler.
  // Success -> 200 -> reconciler flips reminder_X_sent = true.
  // Failure -> 5xx -> reconciler records HTTP error and bumps attempts.
  await sendWithRetry({ to: assigneeEmail, subject, text, html });
  return { sent: true };
}
