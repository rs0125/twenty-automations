import prisma from "../lib/prisma.js";
import { sendMail } from "./email.service.js";

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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readField(data, key) {
  if (!data) return null;
  const v = data[key];
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return `${DATE_FORMATTER.format(d)} IST`;
}

/**
 * Returns how long ago a date was, in a human-readable string.
 * e.g. "2 days ago", "5 hours ago", "just now"
 */
function timeAgo(value) {
  if (!value) return "—";
  const diffMs = Date.now() - new Date(value).getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

/**
 * Build one HTML row for a deal in the digest table.
 */
function dealRow(opp) {
  const data = opp.data || {};
  const deal = escapeHtml(readField(data, "deal_name") || opp.opportunityId);
  const company = escapeHtml(readField(data, "company") || "—");
  const poc = escapeHtml(readField(data, "POC Name") || readField(data, "poc_name") || "—");
  const phone = escapeHtml(readField(data, "POC Phone Number") || readField(data, "poc_phone") || "—");
  const idle = escapeHtml(timeAgo(opp.lastActivityAt));
  const created = escapeHtml(formatDate(opp.createdAt));

  return `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:12px 8px; font-weight:600; color:#111827; font-size:13px;">${deal}</td>
      <td style="padding:12px 8px; color:#374151; font-size:13px;">${company}</td>
      <td style="padding:12px 8px; color:#374151; font-size:13px;">${poc}</td>
      <td style="padding:12px 8px; color:#374151; font-size:13px;">${phone}</td>
      <td style="padding:12px 8px; color:#374151; font-size:13px;">${created}</td>
      <td style="padding:12px 8px; font-size:13px; color:${idle.includes('d ago') ? '#dc2626' : '#6b7280'};">${idle}</td>
    </tr>`;
}

function buildHtmlDigest({ opps, window: win }) {
  const greeting = win === "morning" ? "Good morning" : "Good evening";
  const windowLabel = win === "morning" ? "Morning" : "Evening";
  const rows = opps.map(dealRow).join("");
  const count = opps.length;

  return `<!doctype html>
<html>
  <body style="margin:0; padding:24px; background:#f9fafb; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#111827;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:720px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px;">
      <tr>
        <td style="padding:24px 32px; border-bottom:1px solid #e5e7eb;">
          <h2 style="margin:0 0 4px; font-size:18px; font-weight:600; color:#111827;">${escapeHtml(greeting)} — ${escapeHtml(windowLabel)} Lead Summary</h2>
          <p style="margin:0; font-size:14px; color:#6b7280;">
            You have <strong>${count} open RFQ${count === 1 ? "" : "s"}</strong> in <em>RFQ Received</em> assigned to you.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr style="background:#f9fafb; border-bottom:2px solid #e5e7eb;">
                <th style="padding:8px 8px; text-align:left; color:#6b7280; font-weight:600; white-space:nowrap;">Deal</th>
                <th style="padding:8px 8px; text-align:left; color:#6b7280; font-weight:600;">Company</th>
                <th style="padding:8px 8px; text-align:left; color:#6b7280; font-weight:600;">POC Name</th>
                <th style="padding:8px 8px; text-align:left; color:#6b7280; font-weight:600; white-space:nowrap;">POC Phone</th>
                <th style="padding:8px 8px; text-align:left; color:#6b7280; font-weight:600; white-space:nowrap;">Created</th>
                <th style="padding:8px 8px; text-align:left; color:#6b7280; font-weight:600; white-space:nowrap;">Last Active</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px 24px; border-top:1px solid #e5e7eb; font-size:14px;">
          <a href="${DASHBOARD_URL}" style="color:#2563eb; text-decoration:none;">Open dashboard &rarr;</a>
        </td>
      </tr>
    </table>
    <p style="max-width:720px; margin:16px auto 0; font-size:12px; color:#9ca3af; text-align:center;">
      Automated daily summary from Wareongo CRM
    </p>
  </body>
</html>`;
}

function buildTextDigest({ opps, window: win }) {
  const greeting = win === "morning" ? "Good morning" : "Good evening";
  const lines = opps.map((opp) => {
    const data = opp.data || {};
    const deal = readField(data, "deal_name") || opp.opportunityId;
    const company = readField(data, "company") || "—";
    const idle = timeAgo(opp.lastActivityAt);
    return `• ${deal} (${company}) — last active ${idle}`;
  });

  return [
    `${greeting} — you have ${opps.length} open RFQ(s) in RFQ Received:`,
    "",
    ...lines,
    "",
    `Dashboard: ${DASHBOARD_URL}`,
    "",
    "— Wareongo CRM",
  ].join("\n");
}

/**
 * Main entry point called by the controller.
 * - Fetches all RFQ_RECEIVED opportunities.
 * - Groups by each email in assignee_email (comma-separated).
 * - Sends one digest per recipient; skips if no deals.
 *
 * @param {string} window - 'morning' | 'evening'
 * @returns {{ sent: number, skipped: number, total: number }}
 */
export async function processDailySummary({ window: win }) {
  // 1. Fetch all open RFQ_RECEIVED deals with an assignee
  const opps = await prisma.opportunity.findMany({
    where: {
      stage: "RFQ_RECEIVED",
      assigneeEmail: { not: null },
    },
    orderBy: { lastActivityAt: "asc" },
  });

  if (opps.length === 0) {
    console.log("[daily-summary] No open RFQ_RECEIVED opportunities — nothing to send.");
    return { sent: 0, skipped: 0, total: 0 };
  }

  // 2. Group opportunities by individual assignee email
  // assigneeEmail may be a comma-separated list (creator prepended by webhook)
  const byEmail = new Map(); // email -> Opportunity[]

  for (const opp of opps) {
    const emails = (opp.assigneeEmail || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    for (const email of emails) {
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(opp);
    }
  }

  // 3. Send one digest per recipient, skip if empty
  const windowLabel = win === "morning" ? "Morning" : "Evening";
  let sent = 0;
  let skipped = 0;

  for (const [email, assignedOpps] of byEmail) {
    if (assignedOpps.length === 0) {
      skipped++;
      continue;
    }

    const subject = `[${windowLabel} Summary] ${assignedOpps.length} open RFQ${assignedOpps.length === 1 ? "" : "s"} — Wareongo CRM`;
    const html = buildHtmlDigest({ opps: assignedOpps, window: win });
    const text = buildTextDigest({ opps: assignedOpps, window: win });

    try {
      await sendWithRetry({ to: email, subject, html, text });
      console.log(`[daily-summary] Sent ${windowLabel} digest to ${email} (${assignedOpps.length} deals)`);
      sent++;
    } catch (err) {
      console.error(`[daily-summary] Failed to send to ${email}:`, err.message);
      // Don't throw — continue sending to other recipients
    }
  }

  console.log(`[daily-summary] Done. sent=${sent} skipped=${skipped} total_opps=${opps.length}`);
  return { sent, skipped, total: opps.length };
}
