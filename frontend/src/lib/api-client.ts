import type { ApiError as ApiErrorType, ApiResponse } from "@chatbot/shared";
import { API_BASE } from "./utils";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNetworkError() {
    return this.code === "NETWORK_ERROR";
  }

  get isAuthError() {
    return this.status === 401;
  }

  get isRateLimited() {
    return this.status === 429;
  }
}

async function request<T>(endpoint: string, init?: RequestInit): Promise<T> {
  let res: Response;

  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Unable to connect to the server. Check your connection.");
  }

  if (!res.ok) {
    const body: ApiErrorType = await res.json().catch(() => ({
      error: "Unknown error",
      code: "UNKNOWN",
    }));

    // Auto-refresh on 401
    if (res.status === 401) {
      const refreshed = await tryRefresh();
      if (refreshed) return request<T>(endpoint, init);
    }

    throw new ApiError(res.status, body.code, body.error, body.requestId);
  }

  const json: ApiResponse<T> = await res.json();
  return json.data;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};
