import { randomBytes } from "crypto";

export function generateVerificationCode(): string {
  return `BT2-CERT-${randomBytes(4).toString("hex").toUpperCase()}`;
}
