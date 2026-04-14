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

  // Already sent or failed — skip
  if (opportunity[config.sentCol] || opportunity[config.failedCol] != null) {
    return { sent: false, skipped: true };
  }

  const text = `Reminder: The opportunity "${opportunity.data?.deal_name || opportunityId}" has been in RFQ Received for over ${config.timePeriod} without activity. Please follow up.`;

  try {
    await sendWithRetry({ to: assigneeEmail, text, timePeriod: config.timePeriod });

    await prisma.opportunity.update({
      where: { opportunityId },
      data: { [config.sentCol]: true },
    });

    return { sent: true };
  } catch (err) {
    await prisma.opportunity.update({
      where: { opportunityId },
      data: { [config.failedCol]: err.message || "Unknown error" },
    });

    console.error(`[reminder] Failed to send ${step} reminder for ${opportunityId}:`, err.message);
    return { sent: false, failed: true, error: err.message };
  }
}
