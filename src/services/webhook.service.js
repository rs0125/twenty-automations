import prisma from "../lib/prisma.js";
import { getOpportunity } from "./twenty.service.js";
import { findUserByTwentyId } from "./users.service.js";

// Prepend creator email and dedupe (case-insensitive). The first entry becomes
// the To: recipient downstream; the rest are CC'd.
function withCreatorFirst(creatorEmail, assigneeEmail) {
  const existing = String(assigneeEmail || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const e of [creatorEmail, ...existing]) {
    if (!e) continue;
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.length ? out.join(",") : null;
}

function deriveEmail(assignedTo) {
  if (!assignedTo) return null;
  // Twenty sends multiple assignees as a comma-joined string (e.g. "DHAVAL,RAGHAV").
  // Expand each name to <name>@wareongo.com and rejoin. Stored as a comma-separated
  // list; email.service.js splits it back into an array at send time.
  const emails = String(assignedTo)
    .split(",")
    .map((name) => name.replace(/\s+/g, "").toLowerCase())
    .filter(Boolean)
    .map((name) => `${name}@wareongo.com`);
  return emails.length ? emails.join(",") : null;
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
      update_count: { increment: 1 },
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

  // Resolve the deal creator and prepend them to the recipients string so
  // they receive every reminder as the primary (To:) recipient. The webhook
  // payload itself doesn't carry createdBy, so fetch it from Twenty. Failure
  // here must not break the upsert — log and move on.
  try {
    const full = await getOpportunity(id);
    const creatorMemberId = full?.createdBy?.workspaceMemberId;
    if (creatorMemberId) {
      const creator = await findUserByTwentyId(creatorMemberId);
      if (creator?.email) {
        const merged = withCreatorFirst(creator.email, assigneeEmail);
        if (merged !== assigneeEmail) {
          await prisma.opportunity.update({
            where: { opportunityId: id },
            data: { assigneeEmail: merged },
          });
        }
      }
    }
  } catch (err) {
    console.error(`[webhook] creator resolution failed for ${id}:`, err.message);
  }
}
