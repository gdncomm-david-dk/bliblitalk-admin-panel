import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiRequestError } from "../services/api";
import { useAuthStore, userIsAdmin } from "../store/authStore";
import { AuthSplitLayout } from "./auth/AuthSplitLayout";
import { AUTH_INPUT_CLASS, AUTH_PRIMARY_BTN } from "./auth/fields";

function MicrosoftGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

// MOCK Microsoft identity for dev — real Entra ID/OIDC replaces this with the
// verified token's claims. Admin accounts are provisioned by IT, so this must
// match an existing admin-role account (e.g. superadmin@gdn-commerce.com).
const MOCK_MICROSOFT = { email: "superadmin@gdn-commerce.com", name: "Super Admin" };

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const microsoftSignIn = useAuthStore((s) => s.microsoftSignIn);
  const status = useAuthStore((s) => s.status);

  const [mode, setMode] = useState<"choice" | "email">("choice");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msBusy, setMsBusy] = useState(false);

  useEffect(() => {
    if (status === "authed") {
      const user = useAuthStore.getState().user;
      navigate(userIsAdmin(user) ? "/" : "/unauthorized", { replace: true });
    }
  }, [status, navigate]);

  const onMicrosoft = async () => {
    setError(null);
    setMsBusy(true);
    try {
      await microsoftSignIn(MOCK_MICROSOFT);
      const user = useAuthStore.getState().user;
      navigate(userIsAdmin(user) ? "/" : "/unauthorized", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.apiError.message : "Microsoft sign-in failed. Try again.",
      );
    } finally {
      setMsBusy(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      const user = useAuthStore.getState().user;
      navigate(userIsAdmin(user) ? "/" : "/unauthorized", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.apiError.message : "Login failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthSplitLayout>
      <h1 className="text-center text-lg font-bold text-ink">Blibli Talk Admin</h1>
      <p className="mt-1 text-center text-sm text-muted">Sign in to the Talent Engagement CMS</p>

      {mode === "choice" ? (
        <div className="mt-6 space-y-4">
          {/* SEC-001: the backend's /auth/microsoft is an unauthenticated mock (no real
              Entra ID/OIDC verification) and is blocked outright once NODE_ENV=production
              (see auth.routes.ts's mockProviderGate) — never show this button outside dev,
              matching the demo-credentials hint below. */}
          {import.meta.env.DEV && (
            <button
              onClick={onMicrosoft}
              disabled={msBusy}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-primary/40 bg-white text-sm font-semibold text-primary transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <MicrosoftGlyph />
              {msBusy ? "Connecting…" : "Continue with Microsoft"}
            </button>
          )}

          {import.meta.env.DEV && (
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" />
              or sign in with email
              <span className="h-px flex-1 bg-line" />
            </div>
          )}

          <button onClick={() => setMode("email")} className={AUTH_PRIMARY_BTN}>
            Sign In with Email
          </button>

          {error && <p className="text-center text-xs font-medium text-status-red">{error}</p>}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@gdn-commerce.com"
            className={AUTH_INPUT_CLASS}
          />
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className={AUTH_INPUT_CLASS}
          />
          {error && <p className="text-xs font-medium text-status-red">{error}</p>}
          <button type="submit" disabled={submitting} className={AUTH_PRIMARY_BTN}>
            {submitting ? "Signing in…" : "Sign In"}
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMode("choice");
            }}
            className="w-full text-center text-xs font-medium text-muted hover:text-ink"
          >
            ← Use another method
          </button>
        </form>
      )}

      {import.meta.env.DEV && (
        <p className="mt-6 rounded-xl bg-surface p-3 text-center text-xs text-muted">
          Demo: <b>superadmin@gdn-commerce.com</b> / <b>password123</b>
        </p>
      )}
    </AuthSplitLayout>
  );
}
