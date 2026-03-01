/**
 * API client wrapper - returns { data, error } matching server convention.
 * Supports auth header injection for mobile (Bearer token).
 */

import type { ApiResponse } from "@beautonomi/types";

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: Record<string, unknown> | FormData | object;
  baseUrl?: string;
  /** Inject Authorization: Bearer <token> when calling API. For mobile/Expo. */
  getAccessToken?: () => Promise<string | null>;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

/**
 * Fetch wrapper that parses JSON and returns { data, error } shape.
 * When getAccessToken is provided, injects Authorization header.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { body, baseUrl = "", getAccessToken, timeout = 30000, ...init } = options;

  const url = path.startsWith("http")
    ? path
    : `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  if (getAccessToken) {
    const token = await getAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const fetchInit: RequestInit = {
    ...init,
    headers,
  };

  if (body !== undefined && body !== null) {
    if (body instanceof FormData) {
      delete (headers as Record<string, string>)["Content-Type"];
      fetchInit.body = body;
    } else {
      fetchInit.body = JSON.stringify(body);
    }
  }

  try {
    // Add timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    fetchInit.signal = controller.signal;

    const response = await fetch(url, fetchInit);
    clearTimeout(timeoutId);
    const json = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        data: null,
        error: {
          message: json?.error?.message ?? `Request failed: ${response.statusText}`,
          code: json?.error?.code,
          details: json?.error?.details,
          status: response.status,
        },
      };
    }

    return {
      data: json?.data ?? json ?? null,
      error: null,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      data: null,
      error: {
        message: isTimeout 
          ? "Request timed out. Please check your internet connection and try again."
          : err instanceof Error 
            ? err.message 
            : "Request failed",
        code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
      },
    };
  }
}

export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null>;
  /** Default headers sent with every request (e.g. X-App: provider for provider app). */
  headers?: Record<string, string>;
}

/**
 * Create an API client with baseUrl and optional auth.
 * Use in Expo apps to call apps/web APIs with Bearer token.
 */
export function createApiClient(config: ApiClientConfig) {
  const { baseUrl, getAccessToken, headers: defaultHeaders } = config;

  const request = <T>(
    path: string,
    options: Omit<RequestOptions, "baseUrl" | "getAccessToken"> = {}
  ) =>
    apiFetch<T>(path, {
      ...options,
      baseUrl,
      getAccessToken,
      headers: { ...defaultHeaders, ...(options.headers as Record<string, string>) },
    });

  return {
    get: <T>(path: string, init?: Omit<RequestInit, "body">) =>
      request<T>(path, { ...init, method: "GET" }),
    post: <T>(path: string, body?: Record<string, unknown>, init?: Omit<RequestInit, "body">) =>
      request<T>(path, { ...init, method: "POST", body }),
    put: <T>(path: string, body?: Record<string, unknown>, init?: Omit<RequestInit, "body">) =>
      request<T>(path, { ...init, method: "PUT", body }),
    patch: <T>(path: string, body?: Record<string, unknown>, init?: Omit<RequestInit, "body">) =>
      request<T>(path, { ...init, method: "PATCH", body }),
    delete: <T>(path: string, init?: Omit<RequestInit, "body">) =>
      request<T>(path, { ...init, method: "DELETE" }),
    fetch: request,
  };
}
