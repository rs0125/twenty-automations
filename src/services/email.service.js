import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendMail({ to, subject, text, html, timePeriod }) {
  // `to` may be a single email, a comma-separated string ("a@x.com,b@x.com"),
  // or an array. Normalize to an array for Resend.
  const recipients = Array.isArray(to)
    ? to
    : String(to)
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

  if (recipients.length === 0) {
    const err = new Error("No recipients");
    err.status = 422;
    throw err;
  }

  // First assignee on To:, rest on Cc:.
  const [primary, ...cc] = recipients;

  // Back-compat: older callers pass { timePeriod } instead of { subject }.
  const finalSubject = subject || `[${timePeriod}] RFQ Reminder`;

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM || "onboarding@resend.dev",
    to: primary,
    ...(cc.length ? { cc } : {}),
    subject: finalSubject,
    text,
    ...(html ? { html } : {}),
  });

  if (error) {
    const err = new Error(error.message);
    err.status = 422;
    throw err;
  }

  return { id: data.id };
}
