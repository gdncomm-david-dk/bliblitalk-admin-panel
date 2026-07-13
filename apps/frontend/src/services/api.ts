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
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
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
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const apiError: ApiError = data?.error ?? { code: "UNKNOWN", message: "Upload failed" };
    throw new ApiRequestError(res.status, apiError);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, file: File) => upload<T>(path, file),
};
