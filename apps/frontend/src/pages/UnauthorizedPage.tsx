import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export function UnauthorizedPage() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-status-red">
        <span className="text-xl font-bold">!</span>
      </div>
      <div>
        <h1 className="text-lg font-bold text-ink">Access denied</h1>
        <p className="mt-1 max-w-sm text-sm text-muted">
          Your account does not have permission to use the Admin CMS. If you believe this is a
          mistake, contact a Super Admin.
        </p>
      </div>
      <button
        onClick={handleLogout}
        className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white"
      >
        Sign in with a different account
      </button>
    </div>
  );
}
