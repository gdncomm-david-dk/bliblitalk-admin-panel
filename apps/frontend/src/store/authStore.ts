import { create } from "zustand";
import type { UserDTO } from "@repo/shared-types";
import { isAdminRole } from "@repo/auth";
import { api, ApiRequestError } from "../services/api";
import {
  clearDevUser,
  fetchGatewayIdentity,
  getDevUser,
  goToGatewayLogin,
  goToGatewayLogout,
} from "../services/gatewayAuth";

/**
 * There is no login action here, and no session for this app to hold.
 *
 * Apps Gateway authenticates every request before it reaches us (2026-08-06) and forwards the
 * user's email in X-User-Id; the backend turns that into a User row. So the store only asks
 * two questions on boot — is anyone signed in, and does that person have an Admin CMS role —
 * and hands off to the gateway for the answers it cannot give itself.
 */
type AuthStatus =
  | "idle"
  /** Bootstrapping — asking the gateway, then the API, who this is. */
  | "loading"
  /** Signed in at the gateway and holding an Admin CMS role. */
  | "authed"
  /** No gateway session (production redirects; dev falls back to /dev-login). */
  | "anon"
  /** Signed in at the gateway, but this app has no admin account for that email. */
  | "no-access";

interface AuthState {
  user: UserDTO | null;
  status: AuthStatus;
  bootstrap: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "idle",

  bootstrap: async () => {
    set({ status: "loading" });

    // Locally there is no gateway to ask; /dev-login stands in for it.
    if (import.meta.env.DEV && !getDevUser()) {
      set({ user: null, status: "anon" });
      return;
    }

    try {
      // The gateway's cookie is HttpOnly, so /auth/api/me is the only way the browser can
      // learn whether a session exists. Skipped in dev, where the gateway isn't running.
      if (!import.meta.env.DEV && (await fetchGatewayIdentity()) === null) {
        set({ user: null, status: "anon" });
        return;
      }

      // Identity comes from the gateway; the *role* comes from this app's own User row.
      // The gateway's `admin` flag is never reused as an Admin CMS role.
      const { user } = await api.get<{ user: UserDTO }>("/me");
      set({ user, status: "authed" });
    } catch (err) {
      // 403 NO_ADMIN_ACCOUNT: authenticated, but not provisioned here — a different screen
      // from "not signed in", and deliberately not a redirect back to the gateway, which
      // would just bounce the browser between a valid session and a login page.
      if (err instanceof ApiRequestError && err.status === 403) {
        set({ user: null, status: "no-access" });
        return;
      }
      set({ user: null, status: "anon" });
    }
  },

  logout: () => {
    set({ user: null, status: "anon" });
    if (import.meta.env.DEV) {
      clearDevUser();
      window.location.assign("/dev-login");
      return;
    }
    // Full-page navigation: logout clears the SSO session for every app on the domain,
    // which is the gateway's job, not something this SPA can do with a fetch.
    goToGatewayLogout();
  },
}));

/** Send the browser to wherever it can sign in — the gateway in prod, /dev-login locally. */
export function redirectToLogin(): void {
  if (import.meta.env.DEV) {
    window.location.assign("/dev-login");
    return;
  }
  goToGatewayLogin();
}

/** Whether the current user may access the Admin CMS at all. */
export function userIsAdmin(user: UserDTO | null): boolean {
  return user != null && isAdminRole(user.role);
}
