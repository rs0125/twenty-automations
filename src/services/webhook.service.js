import prisma from "../lib/prisma.js";

function deriveEmail(assignedTo) {
  if (!assignedTo) return null;
  return assignedTo.replace(/\s+/g, "").toLowerCase() + "@wareongo.com";
}

export async function upsertOpportunity(body) {
  const {
    id,
    stage,
    assigned_to,
    description,
    company,
    "POC Name": pocName,
    "POC Phone Number": pocPhone,
    created_at,
    last_updated,
    deal_name,
  } = body;

  if (!id) {
    throw new Error("Missing 'id' in webhook payload");
  }

  const assigneeEmail = deriveEmail(assigned_to);

  await prisma.opportunity.upsert({
    where: { opportunityId: id },
    update: {
      data: body,
      stage,
      assigneeEmail,
      lastActivityAt: new Date(),
      // Reset reminders on any activity
      reminder1hSent: false,
      reminder1dSent: false,
      reminder3dSent: false,
      reminder1hFailed: null,
      reminder1dFailed: null,
      reminder3dFailed: null,
    },
    create: {
      opportunityId: id,
      data: body,
      stage,
      assigneeEmail,
    },
  });
}
