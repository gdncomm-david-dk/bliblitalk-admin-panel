import { createHash } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../../config";
import { logger } from "../../logger";
import { sanitizeEmailHtml } from "./emailHtml";

/**
 * Short, stable, non-reversible reference so two log lines for the same recipient can still
 * be correlated during an incident without the address itself being written down.
 */
function emailRef(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 12);
}

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

/** Delivers an already-sanitised body. Private so no caller can skip the allowlist. */
async function deliver(to: string, subject: string, safeHtml: string): Promise<void> {
  const transport = getTransporter();
  if (!transport) throw new Error(EMAIL_NOT_CONFIGURED_MESSAGE);
  await transport.sendMail({ from: config.smtp.from, to, subject, html: safeHtml });
}

/**
 * Sends one HTML email. Throws EMAIL_NOT_CONFIGURED_MESSAGE if no SMTP transport is set up.
 *
 * SEC-015: the body is sanitised here rather than by the caller, so every outbound message
 * passes the allowlist whether or not a future sender remembers to. See `emailHtml.ts` for
 * what survives and why.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  await deliver(to, subject, sanitizeEmailHtml(html));
}

/**
 * Sends the same email to many recipients, tolerating per-recipient failures.
 * Used by marketing campaigns and event reminders, which both need a count of
 * how many sends actually succeeded rather than an all-or-nothing throw.
 *
 * SEC-015: the body is sanitised once for the whole batch rather than per recipient — the
 * input is identical for every send, and a campaign to the full registrant base would
 * otherwise re-parse the same HTML thousands of times.
 */
export async function sendBulkEmail(
  recipients: { email: string }[],
  subject: string,
  html: string,
): Promise<{ sentCount: number; failedCount: number; errors: { email: string; error: string }[] }> {
  const safeHtml = sanitizeEmailHtml(html);
  let sentCount = 0;
  const errors: { email: string; error: string }[] = [];
  for (const { email } of recipients) {
    try {
      await deliver(email, subject, safeHtml);
      sentCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      errors.push({ email, error: message });
      // An email address is PII and never goes to logs (CLAUDE.md; and the sibling repo's
      // registrationEmail.ts already does this). The returned `errors` array still carries
      // the address — that goes to an authorised admin response, not to stdout, where a log
      // platform has a wider audience and a longer retention than this CMS. `err` is narrowed
      // to its message on purpose: an SMTP rejection commonly echoes the recipient back.
      logger.warn({ recipientRef: emailRef(email), reason: message }, "Failed to send email");
    }
  }
  return { sentCount, failedCount: errors.length, errors };
}
