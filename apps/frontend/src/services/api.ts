import { authHeaders } from "./gatewayAuth";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public apiError: ApiError,
  ) {
    super(apiError.message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // credentials: "include" carries the gateway's SSO cookie; authHeaders() is the DEV-only
  // stand-in for the X-User-Id the gateway injects in production (see gatewayAuth.ts).
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...authHeaders(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const apiError: ApiError = data?.error ?? { code: "UNKNOWN", message: "Request failed" };
    throw new ApiRequestError(res.status, apiError);
  }
  return data as T;
}

async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(),
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const apiError: ApiError = data?.error ?? { code: "UNKNOWN", message: "Upload failed" };
    throw new ApiRequestError(res.status, apiError);
  }
  return data as T;
}

/**
 * SEC-011: fetches a server-generated file. Separate from `request` because that one parses
 * every response as JSON, and these endpoints return CSV.
 *
 * An error response is still JSON, so a failure is surfaced with the same `ApiRequestError`
 * shape as everything else — a 403 from the export gate reaches the page as a readable message
 * rather than a corrupt download.
 */
async function getText(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const apiError: ApiError = data?.error ?? { code: "UNKNOWN", message: "Download failed" };
    throw new ApiRequestError(res.status, apiError);
  }
  return res.text();
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  getText: (path: string) => getText(path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, file: File) => upload<T>(path, file),
};
