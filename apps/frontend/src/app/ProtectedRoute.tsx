import { type ReactNode, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { redirectToLogin, useAuthStore, userIsAdmin } from "../store/authStore";

/**
 * Gate for the Admin CMS. Resolves who is signed in on mount, then:
 *  - no gateway session → hand off to the gateway's login page (a full-page navigation
 *    in production; /dev-login locally)
 *  - signed in but this app has no admin account for them → /unauthorized
 *  - admin role → renders children
 *
 * This is a convenience gate, not the security boundary: the gateway blocks unauthenticated
 * requests at the edge and requireAuth re-checks the role on every API call, so nothing here
 * is load-bearing for access control.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, status, bootstrap } = useAuthStore();

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  // A full-page navigation, so this effect only ever fires once per load.
  useEffect(() => {
    if (status === "anon") redirectToLogin();
  }, [status]);

  if (status === "no-access") return <Navigate to="/unauthorized" replace />;

  if (status === "authed" && user) {
    // Belt and braces: the backend already 403s a non-admin role, so this only trips if
    // the DTO and the role check ever disagree.
    if (!userIsAdmin(user)) return <Navigate to="/unauthorized" replace />;
    return <>{children}</>;
  }

  // idle / loading / anon (mid-redirect) all render the same spinner.
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
