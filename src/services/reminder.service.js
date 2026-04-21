import prisma from "../lib/prisma.js";
import { sendMail } from "./email.service.js";

const STEP_CONFIG = {
  "1h": { sentCol: "reminder1hSent", failedCol: "reminder1hFailed", timePeriod: "1 hour" },
  "1d": { sentCol: "reminder1dSent", failedCol: "reminder1dFailed", timePeriod: "1 day" },
  "3d": { sentCol: "reminder3dSent", failedCol: "reminder3dFailed", timePeriod: "3 days" },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWithRetry({ to, text, timePeriod }, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendMail({ to, text, timePeriod });
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await sleep(1000 * 2 ** attempt); // 2s, 4s, 8s
    }
  }
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

  const text = `Reminder: The opportunity "${opportunity.data?.deal_name || opportunityId}" has been in RFQ Received for over ${config.timePeriod} without activity. Please follow up.`;

  // Send and let the caller's HTTP status drive the reconciler.
  // Success -> 200 -> reconciler flips reminder_X_sent = true.
  // Failure -> 5xx -> reconciler records HTTP error and bumps attempts.
  await sendWithRetry({ to: assigneeEmail, text, timePeriod: config.timePeriod });
  return { sent: true };
}
