import { useAuthStore } from "../store/authStore";

/**
 * Shown when Apps Gateway let the person in but this app has no Admin CMS account for their
 * email (the backend's 403 NO_ADMIN_ACCOUNT). Deliberately not a redirect back to the gateway:
 * their session is perfectly valid, so bouncing them to login would just loop.
 */
export function UnauthorizedPage() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-status-red">
        <span className="text-xl font-bold">!</span>
      </div>
      <div>
        <h1 className="text-lg font-bold text-ink">No Admin CMS account</h1>
        <p className="mt-1 max-w-sm text-sm text-muted">
          You are signed in, but this account has not been granted access to the Blibli Talk
          Admin CMS. Ask a Super Admin to add you, or contact IT if you believe this is a
          mistake.
        </p>
      </div>
      <button
        onClick={logout}
        className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white"
      >
        Sign out
      </button>
    </div>
  );
}
