/**
 * Apps Gateway glue for the browser.
 *
 * In production the gateway sits in front of this app: it authenticates the user, strips any
 * client-supplied X-User-Id, and injects its own. The SPA therefore never handles credentials,
 * never holds a session, and never sends an identity header — it only navigates to the
 * gateway's own pages for login/logout and asks it who is signed in.
 *
 * Locally there is no gateway, so DEV builds simulate one: /dev-login stores an email in
 * localStorage and every API call sends it as X-User-Id.
 *
 * The DEV guard is `import.meta.env.DEV` alone, deliberately narrower than the plugin
 * template's `DEV || hostname === "localhost"`. Vite replaces it with the literal `false` in a
 * production build, so the simulation code is removed from the bundle at build time rather
 * than merely skipped at runtime — there is no header to spoof if the code does not ship.
 */

/** localStorage key holding the simulated signed-in email. DEV only. */
export const DEV_USER_KEY = "dev_user";

/** Identity header the gateway injects; matches USER_ID_HEADER in the backend. */
const USER_ID_HEADER = "X-User-Id";

/** Simulated gateway identity for local dev. Always `{}` in a production build. */
export function authHeaders(): Record<string, string> {
  if (!import.meta.env.DEV) return {};
  const email = window.localStorage.getItem(DEV_USER_KEY);
  return email ? { [USER_ID_HEADER]: email } : {};
}

export function getDevUser(): string | null {
  if (!import.meta.env.DEV) return null;
  return window.localStorage.getItem(DEV_USER_KEY);
}

export function setDevUser(email: string): void {
  if (!import.meta.env.DEV) return;
  window.localStorage.setItem(DEV_USER_KEY, email);
}

export function clearDevUser(): void {
  if (!import.meta.env.DEV) return;
  window.localStorage.removeItem(DEV_USER_KEY);
}

/**
 * Send the browser to the gateway's login page. A full-page navigation, not a router push:
 * /auth/** belongs to the gateway, and no SPA route may claim it.
 */
export function goToGatewayLogin(redirectPath?: string): void {
  const path = redirectPath ?? `${window.location.pathname}${window.location.search}`;
  const target = path.startsWith("/") ? path : `/${path}`;
  window.location.assign(`/auth/ui/login?redirect=${encodeURIComponent(target)}`);
}

/** Full-page logout at the gateway, which clears the SSO session for every app on the domain. */
export function goToGatewayLogout(): void {
  window.location.assign("/auth/logout");
}

/**
 * Ask the gateway who is signed in. The session cookie is HttpOnly, so this is the only way
 * the browser can find out. Returns null when there is no session (401).
 *
 * `admin` is the *gateway's* flag and is deliberately ignored by this app: Admin CMS
 * permissions come from the User row's role, resolved server-side in GET /api/me.
 */
export async function fetchGatewayIdentity(): Promise<{ email: string } | null> {
  const res = await fetch("/auth/api/me", { headers: { Accept: "application/json" } });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/auth/api/me responded ${res.status}`);
  return (await res.json()) as { email: string };
}
