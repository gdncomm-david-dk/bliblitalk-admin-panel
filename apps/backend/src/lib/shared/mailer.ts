import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../../config";
import { logger } from "../../logger";

export const EMAIL_NOT_CONFIGURED_MESSAGE =
  "Email sending is not configured. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM in the API's environment to enable real delivery.";

let transporter: Transporter | null = null;
let attemptedSetup = false;

function getTransporter(): Transporter | null {
  if (!config.smtp.host) return null;
  if (!attemptedSetup) {
    attemptedSetup = true;
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

/** Whether a real SMTP transport is configured (vs. sendEmail throwing on every call). */
export function isEmailConfigured(): boolean {
  return Boolean(config.smtp.host);
}

/** Sends one HTML email. Throws EMAIL_NOT_CONFIGURED_MESSAGE if no SMTP transport is set up. */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const transport = getTransporter();
  if (!transport) throw new Error(EMAIL_NOT_CONFIGURED_MESSAGE);
  await transport.sendMail({ from: config.smtp.from, to, subject, html });
}

/**
 * Sends the same email to many recipients, tolerating per-recipient failures.
 * Used by marketing campaigns and event reminders, which both need a count of
 * how many sends actually succeeded rather than an all-or-nothing throw.
 */
export async function sendBulkEmail(
  recipients: { email: string }[],
  subject: string,
  html: string,
): Promise<{ sentCount: number; failedCount: number; errors: { email: string; error: string }[] }> {
  let sentCount = 0;
  const errors: { email: string; error: string }[] = [];
  for (const { email } of recipients) {
    try {
      await sendEmail(email, subject, html);
      sentCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      errors.push({ email, error: message });
      logger.warn({ email, err }, "Failed to send email");
    }
  }
  return { sentCount, failedCount: errors.length, errors };
}
