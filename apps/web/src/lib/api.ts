import { API_BASE_URL } from "./config";
import { getAccessToken, setAccessToken } from "./token-store";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
}

const CSRF_HEADERS = { "X-Requested-With": "XMLHttpRequest" };

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { ...CSRF_HEADERS, ...options.headers };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const token = getAccessToken();
  if (options.auth !== false && token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  return fetch(`${API_BASE_URL}${path}`, init);
}

async function parseError(response: Response): Promise<ApiError> {
  let code = "internal_error";
  let message = "Something went wrong. Please try again.";
  let details: unknown;

  try {
    const payload = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    if (payload.error) {
      code = payload.error.code ?? code;
      message = payload.error.message ?? message;
      details = payload.error.details;
    }
  } catch {
    // Non-JSON body — keep the generic message.
  }

  return new ApiError(code, message, response.status, details);
}

async function performRefresh(): Promise<boolean> {
  try {
    const response = await rawRequest("/auth/refresh", { method: "POST", auth: false });
    if (!response.ok) {
      setAccessToken(null);
      return false;
    }
    const payload = (await response.json()) as { data: { accessToken: string } };
    setAccessToken(payload.data.accessToken);
    return true;
  } catch {
    setAccessToken(null);
    return false;
  }
}

let refreshPromise: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function fetchWithRefresh(path: string, options: RequestOptions): Promise<Response> {
  let response = await rawRequest(path, options);

  if (response.status === 401 && options.auth !== false) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await rawRequest(path, options);
    }
  }

  return response;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetchWithRefresh(path, options);

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json()) as { data: T };
  return payload.data;
}

export async function apiFetchText(
  path: string,
  options: RequestOptions = {},
): Promise<{ text: string; filename: string | null }> {
  const response = await fetchWithRefresh(path, options);

  if (!response.ok) {
    throw await parseError(response);
  }

  const disposition = response.headers?.get?.("content-disposition") ?? null;
  const match = disposition ? /filename="?([^";]+)"?/.exec(disposition) : null;

  return { text: await response.text(), filename: match?.[1] ?? null };
}
