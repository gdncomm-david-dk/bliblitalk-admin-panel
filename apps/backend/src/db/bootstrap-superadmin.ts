/**
 * Grants SUPER_ADMIN to one named person, so a fresh environment has someone who can log in.
 *
 * Why this exists: since the Apps Gateway migration (2026-08-06) this app issues no
 * credentials of its own. The gateway authenticates at the edge and forwards the user's
 * email in `X-User-Id`; `requireAuth` maps it onto a `User` row and returns
 * 403 NO_ADMIN_ACCOUNT when there is no admin row for that address. On a freshly migrated
 * staging or production database the `User` table is empty, so *every* sign-in hits that
 * wall — including the person who is supposed to create the other accounts. Something has
 * to write the first row out-of-band. That is this script, and nothing else.
 *
 * It takes the address explicitly rather than promoting "whoever logs in first". An
 * auto-promote-on-first-login rule would hand SUPER_ADMIN to whichever gateway-whitelisted
 * person happens to open the URL first — a race decided by timing, not by intent — and it
 * would live in the request path, where it stays long after the environment is bootstrapped.
 * Naming the address makes the grant deliberate, auditable, and confined to a command an
 * operator runs once.
 *
 * Idempotent: run it twice and the second run reports "already SUPER_ADMIN" and writes
 * nothing. Safe to re-run after a reseed.
 *
 * Usage (from the repo root, or inside the running container):
 *   pnpm --filter @repo/backend bootstrap:superadmin someone@gdn-commerce.com
 *   pnpm --filter @repo/backend bootstrap:superadmin someone@gdn-commerce.com "Full Name"
 *
 * The address must match what the gateway sends in `X-User-Id`, character for character —
 * `requireAuth` looks the row up with an exact-match unique query, and Postgres string
 * comparison is case-sensitive.
 */
import "dotenv/config";
import { prisma } from "./client";

const USAGE = `
Usage:
  pnpm --filter @repo/backend bootstrap:superadmin <email> [name]

  <email>  The address the Apps Gateway will send in X-User-Id. Required — there is
           deliberately no default, so nobody is granted SUPER_ADMIN by accident.
  [name]   Display name. Defaults to the local part of the email, title-cased.
`.trim();

/** "david.dk" -> "David Dk". Only a starting value; the account holder can edit it later. */
function nameFromEmail(email: string): string {
  return (email.split("@")[0] ?? email)
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim();
  const name = process.argv[3]?.trim();

  if (!email) {
    console.error("error: no email given.\n");
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  // Deliberately loose: the authority on what is a valid address is the gateway, not this
  // script. This only catches an obviously wrong argument (a flag, a name, a bare word).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`error: "${email}" does not look like an email address.\n`);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  // Not normalized to lowercase on purpose. `requireAuth` queries the unique index with the
  // raw header value, so a row stored lowercase would not match a gateway that sends mixed
  // case — the sign-in would fail with the same 403 this script exists to prevent. Warn
  // instead, and let the operator confirm against the gateway.
  if (email !== email.toLowerCase()) {
    console.warn(
      `warning: "${email}" contains uppercase characters. It is stored exactly as given and\n` +
        "         must match the gateway's X-User-Id byte for byte, or sign-in will still 403.",
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, name: true, tokenVersion: true },
  });

  if (!existing) {
    const created = await prisma.user.create({
      data: {
        email,
        name: name ?? nameFromEmail(email),
        role: "SUPER_ADMIN",
        // Staff reached through the company gateway are internal by definition.
        employmentType: "INTERNAL",
      },
      select: { id: true, email: true, name: true, role: true },
    });
    console.log(`created ${created.email} as SUPER_ADMIN (id ${created.id}, name "${created.name}")`);
    return;
  }

  if (existing.role === "SUPER_ADMIN") {
    console.log(`no change: ${email} is already SUPER_ADMIN (id ${existing.id})`);
    return;
  }

  // Bumping tokenVersion is not optional on a role change. bliblitalk-user-fe embeds this
  // counter in the participant session token and rejects any token whose value is stale
  // (SEC-007). Promoting a PARTICIPANT without the bump would leave their old participant
  // session valid against the public app while they hold staff privileges here.
  const promoted = await prisma.user.update({
    where: { email },
    data: {
      role: "SUPER_ADMIN",
      tokenVersion: { increment: 1 },
      ...(name ? { name } : {}),
    },
    select: { id: true, email: true, name: true, role: true },
  });
  console.log(
    `promoted ${promoted.email} from ${existing.role} to SUPER_ADMIN (id ${promoted.id}); ` +
      "any existing participant session for this account was invalidated",
  );
}

main()
  .catch((err) => {
    console.error("bootstrap failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
