import { type ReactNode, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore, userIsAdmin } from "../store/authStore";

/**
 * Gate for the Admin CMS. Resolves the session on mount, then:
 *  - unauthenticated → /login
 *  - authenticated but not an admin role → /unauthorized
 *  - admin role → renders children
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, status, fetchMe } = useAuthStore();

  useEffect(() => {
    if (status === "idle") void fetchMe();
  }, [status, fetchMe]);

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (status === "anon" || !user) return <Navigate to="/login" replace />;
  if (!userIsAdmin(user)) return <Navigate to="/unauthorized" replace />;

  return <>{children}</>;
}
