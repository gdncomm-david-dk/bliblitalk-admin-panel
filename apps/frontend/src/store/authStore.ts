import { create } from "zustand";
import type { LoginInput, MicrosoftAuthInput, UserDTO } from "@repo/shared-types";
import { isAdminRole } from "@repo/auth";
import { api } from "../services/api";

type AuthStatus = "idle" | "loading" | "authed" | "anon";

interface AuthState {
  user: UserDTO | null;
  status: AuthStatus;
  fetchMe: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  microsoftSignIn: (input: MicrosoftAuthInput) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "idle",

  fetchMe: async () => {
    set({ status: "loading" });
    try {
      const { user } = await api.get<{ user: UserDTO }>("/auth/me");
      set({ user, status: "authed" });
    } catch {
      set({ user: null, status: "anon" });
    }
  },

  login: async (input) => {
    const { user } = await api.post<{ user: UserDTO }>("/auth/login", input);
    set({ user, status: "authed" });
  },

  // Unlike the portal's googleSignIn, there is no self-registration branch —
  // admin accounts are provisioned by IT/People Ops. The API 403s (ApiRequestError)
  // for unknown or non-admin accounts; callers surface that message directly.
  microsoftSignIn: async (input) => {
    const { user } = await api.post<{ user: UserDTO }>("/auth/microsoft", input);
    set({ user, status: "authed" });
  },

  logout: async () => {
    await api.post<{ ok: boolean }>("/auth/logout");
    set({ user: null, status: "anon" });
  },
}));

/** Whether the current user may access the Admin CMS at all. */
export function userIsAdmin(user: UserDTO | null): boolean {
  return user != null && isAdminRole(user.role);
}
