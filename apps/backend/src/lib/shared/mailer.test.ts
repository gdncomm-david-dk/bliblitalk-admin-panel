import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SEC-015: `emailHtml.test.ts` proves the allowlist itself is correct. This file proves it is
 * actually *wired into the send path* — that the string handed to the SMTP transport is the
 * sanitised one, for both the single and the bulk sender. Without this, the sanitiser could be
 * silently bypassed by a refactor and every allowlist test would still pass.
 *
 * nodemailer and the SMTP config are stubbed because the assertion is about what the mailer
 * hands over, not about delivery. This is the only place in the backend suite that mocks a
 * module; everything else runs against the real database on purpose.
 */
const sendMail = vi.fn().mockResolvedValue({});

vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

// `logLevel` is here because mailer.ts imports the logger, which builds pino from this same
// config object at module load. A mock that only covers the field under test crashes on import.
vi.mock("../../config", () => ({
  config: {
    logLevel: "silent",
    smtp: { host: "localhost", port: 1025, user: "", pass: "", from: "Test <no-reply@test.invalid>" },
  },
}));

const { sendEmail, sendBulkEmail } = await import("./mailer");

/** The body the transport was actually asked to deliver on call `n`. */
function deliveredHtml(callIndex = 0): string {
  return sendMail.mock.calls[callIndex]![0].html;
}

describe("mailer sanitises before handing anything to SMTP", () => {
  beforeEach(() => sendMail.mockClear());

  it("sendEmail strips a script tag from the delivered body", async () => {
    await sendEmail("someone@test.invalid", "Hi", '<p>Real</p><script>alert(1)</script>');
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(deliveredHtml()).toBe("<p>Real</p>");
  });

  it("sendEmail strips a javascript: href from the delivered body", async () => {
    await sendEmail("someone@test.invalid", "Hi", '<a href="javascript:alert(1)">Go</a>');
    expect(deliveredHtml()).not.toContain("javascript:");
  });

  it("sendBulkEmail delivers the sanitised body to every recipient", async () => {
    const recipients = [{ email: "a@test.invalid" }, { email: "b@test.invalid" }, { email: "c@test.invalid" }];
    const result = await sendBulkEmail(recipients, "Campaign", '<p>Join us</p><script>evil()</script>');

    expect(result.sentCount).toBe(3);
    expect(sendMail).toHaveBeenCalledTimes(3);
    // Not just the first one: a per-recipient loop that sanitised only once at the wrong place
    // would still pass a check on call 0.
    for (let i = 0; i < 3; i++) {
      expect(deliveredHtml(i)).toBe("<p>Join us</p>");
      expect(deliveredHtml(i)).not.toContain("evil");
    }
  });

  it("leaves a legitimate campaign body untouched end to end", async () => {
    const html = '<p>Hi,</p><p><a href="https://blibli.com">Register here</a></p>';
    await sendEmail("someone@test.invalid", "Blibli Talk", html);
    expect(deliveredHtml()).toBe(html);
  });
});
