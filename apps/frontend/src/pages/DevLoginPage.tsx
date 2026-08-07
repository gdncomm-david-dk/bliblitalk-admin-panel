import { useState, type FormEvent } from "react";
import { setDevUser } from "../services/gatewayAuth";
import { AuthSplitLayout } from "./auth/AuthSplitLayout";
import { AUTH_INPUT_CLASS, AUTH_PRIMARY_BTN } from "./auth/fields";

/**
 * DEV-ONLY stand-in for Apps Gateway.
 *
 * In production the gateway authenticates the user before any request reaches this app, and
 * this page does not exist — App.tsx mounts the route behind `import.meta.env.DEV`, which Vite
 * folds to `false` at build time so the component is dropped from the bundle entirely.
 *
 * There is no credential here and nothing is verified: it simply records which email to send
 * as X-User-Id, exactly as the gateway would. The backend still refuses any email that has no
 * Admin CMS role, so this cannot grant access the database does not already allow.
 */

// Emails created by `pnpm db:seed`, one per admin tier, so every role is reachable locally.
const DEFAULT_DEV_EMAIL = "superadmin@gdn-commerce.com";
const SEEDED_ADMINS = [
  { email: DEFAULT_DEV_EMAIL, label: "Super Admin" },
  { email: "eventadmin@gdn-commerce.com", label: "Event Admin" },
  { email: "hrta@gdn-commerce.com", label: "HR / Talent Acquisition" },
];

export function DevLoginPage() {
  const [email, setEmail] = useState(DEFAULT_DEV_EMAIL);

  function signIn(as: string) {
    setDevUser(as);
    // Full page load rather than a router push, mirroring the gateway's own redirect and
    // forcing authStore.bootstrap() to run again with the new identity.
    window.location.assign("/");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    signIn(email.trim());
  }

  return (
    <AuthSplitLayout>
      <h1 className="text-center text-lg font-bold text-ink">Blibli Talk Admin</h1>
      <p className="mt-1 text-center text-sm text-muted">
        Local development sign-in — stands in for Apps Gateway
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@gdn-commerce.com"
          className={AUTH_INPUT_CLASS}
        />
        <button type="submit" className={AUTH_PRIMARY_BTN}>
          Continue
        </button>
      </form>

      <div className="mt-6 space-y-2">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted">
          Seeded accounts
        </p>
        {SEEDED_ADMINS.map((admin) => (
          <button
            key={admin.email}
            onClick={() => signIn(admin.email)}
            className="w-full rounded-lg border border-line px-3 py-2 text-left text-xs text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <span className="font-semibold text-ink">{admin.label}</span> — {admin.email}
          </button>
        ))}
      </div>

      <p className="mt-6 rounded-xl bg-surface p-3 text-center text-xs text-muted">
        No password is checked here. In staging and production, Apps Gateway authenticates with
        your company account before the CMS is reached.
      </p>
    </AuthSplitLayout>
  );
}
