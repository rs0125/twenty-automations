import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendMail({ to, text, timePeriod }) {
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM || "onboarding@resend.dev",
    to,
    subject: `[${timePeriod}] RFQ Reminder`,
    text,
  });

  if (error) {
    const err = new Error(error.message);
    err.status = 422;
    throw err;
  }

  return { id: data.id };
}
