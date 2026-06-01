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

/** Per-request options for GET/POST/PUT/PATCH/DELETE (includes `timeout` — not in `RequestInit`). */
export type ApiClientExtraOptions = Omit<
  RequestOptions,
  "body" | "method" | "baseUrl" | "getAccessToken"
>;

/** JSON or multipart bodies for POST/PUT/PATCH (matches `RequestOptions["body"]` without `undefined`). */
export type ApiClientRequestBody = NonNullable<RequestOptions["body"]>;

function responseBodyLooksLikeHtml(raw: string): boolean {
  const t = raw.trim();
  return (
    t.startsWith("<!DOCTYPE") ||
    t.startsWith("<html") ||
    raw.includes("__next_f")
  );
}

function parseJsonBody(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

/** True if the human `message` already names this permission (snake key or "words with spaces"). */
function messageAlreadyCoversPermission(message: string, permissionKey: string): boolean {
  if (!permissionKey) return false;
  if (message.includes(permissionKey)) return true;
  const asWords = permissionKey.replace(/_/g, " ").toLowerCase();
  return message.toLowerCase().includes(asWords);
}

function extractErrorFromPayload(
  json: unknown,
  fallback: string,
): { message: string; code?: string; details?: unknown } {
  if (!json || typeof json !== "object") {
    return { message: fallback };
  }
  const o = json as Record<string, unknown>;
  /** Many routes set `error` (short code) and `message` (human text); prefer the latter. */
  const topMessage =
    typeof o.message === "string" && o.message.trim() ? o.message.trim() : null;
  const permissionKey =
    typeof o.permission === "string" && o.permission.trim() ? o.permission.trim() : "";

  const err = o.error;
  if (typeof err === "string") {
    let message = topMessage || err || fallback;
    if (permissionKey && !messageAlreadyCoversPermission(message, permissionKey)) {
      message = `${message}\n\nPermission: ${permissionKey}`;
    }
    return {
      message,
      code: typeof o.code === "string" ? o.code : undefined,
      details: o.details,
    };
  }
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const nested =
      typeof e.message === "string" && e.message.trim() ? e.message.trim() : null;
    let message = topMessage || nested || fallback;
    if (permissionKey && !messageAlreadyCoversPermission(message, permissionKey)) {
      message = `${message}\n\nPermission: ${permissionKey}`;
    }
    return {
      message,
      code: typeof e.code === "string" ? e.code : undefined,
      details: e.details,
    };
  }
  if (topMessage) {
    let message = topMessage;
    if (permissionKey && !messageAlreadyCoversPermission(message, permissionKey)) {
      message = `${message}\n\nPermission: ${permissionKey}`;
    }
    return {
      message,
      code: typeof o.code === "string" ? o.code : undefined,
      details: o.details,
    };
  }
  return { message: fallback };
}

/**
 * In-flight GET/HEAD AbortControllers. iOS pauses JS timers while the app is
 * suspended, so the per-request timeout below never fires in the background:
 * stalled requests hang until the app resumes, at which point a whole batch
 * rejects at once with "Request timed out". Apps call `abortInFlightRequests()`
 * when they background to cancel these immediately. Only idempotent reads are
 * tracked — never POST/PUT/PATCH/DELETE — so a backgrounded mutation is never
 * torn down client-side after the server may have already applied it.
 */
const inFlightControllers = new Set<AbortController>();
const backgroundAborted = new WeakSet<AbortController>();

/**
 * Abort every in-flight idempotent request. Call when the app moves to the
 * background so stalled sockets don't hang for minutes. Requests cancelled this
 * way resolve with `code: "CANCELLED"` (not `"TIMEOUT"`) so the UI can stay
 * silent and refetch fresh on the next foreground.
 */
export function abortInFlightRequests(): void {
  inFlightControllers.forEach((controller) => {
    backgroundAborted.add(controller);
    try {
      controller.abort();
    } catch {
      // no-op: aborting an already-settled request is harmless
    }
  });
  inFlightControllers.clear();
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
  const method = String((init as RequestInit).method ?? "GET").toUpperCase();
  const isIdempotent = method === "GET" || method === "HEAD";

  if (!path.startsWith("http") && !baseUrl?.trim()) {
    return {
      data: null,
      error: {
        message:
          "API base URL is not configured (EXPO_PUBLIC_APP_URL). Set it in your app environment.",
        code: "MISSING_API_BASE_URL",
      },
    };
  }

  const url = path.startsWith("http")
    ? path
    : `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  const fetchInit: RequestInit = {
    ...init,
    headers,
    // When using Bearer (e.g. mobile), never send cookies
    ...(getAccessToken ? { credentials: "omit" as RequestCredentials } : {}),
  };

  if (body !== undefined && body !== null) {
    if (body instanceof FormData) {
      delete (headers as Record<string, string>)["Content-Type"];
      fetchInit.body = body;
    } else {
      fetchInit.body = JSON.stringify(body);
    }
  }

  // Declared outside the try so the catch can tell a deliberate background
  // cancellation apart from a real timeout / network error.
  const controller = new AbortController();

  try {
    // Resolve auth token inside the try so any exception is caught and returned as { error }.
    if (getAccessToken) {
      const token = await getAccessToken();
      if (token) {
        (fetchInit.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
      }
    }

    // Add timeout using AbortController
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    fetchInit.signal = controller.signal;
    if (isIdempotent) inFlightControllers.add(controller);

    let response: Response;
    try {
      response = await fetch(url, fetchInit);
    } finally {
      clearTimeout(timeoutId);
      inFlightControllers.delete(controller);
    }

    const rawText = await response.text();
    const html = responseBodyLooksLikeHtml(rawText);
    const parsed = html ? null : parseJsonBody(rawText);

    if (!response.ok) {
      if (html) {
        return {
          data: null,
          error: {
            message:
              response.status === 404
                ? "Could not reach the API (server returned a web page). For local dev, run apps/web with Webpack (pnpm dev) and set EXPO_PUBLIC_APP_URL to that server."
                : `Server returned a web page instead of JSON (HTTP ${response.status}).`,
            code: response.status === 404 ? "NOT_FOUND_HTML" : "HTML_ERROR",
            status: response.status,
          },
        };
      }
      const fromJson =
        parsed !== null
          ? extractErrorFromPayload(parsed, `Request failed: ${response.statusText}`)
          : { message: rawText.trim().slice(0, 500) || `Request failed: ${response.statusText}` };
      return {
        data: null,
        error: {
          message: fromJson.message,
          code: fromJson.code,
          details: fromJson.details,
          status: response.status,
        },
      };
    }

    if (html) {
      return {
        data: null,
        error: {
          message:
            "Invalid API response (received HTML). Check EXPO_PUBLIC_APP_URL and that the web server is running.",
          code: "INVALID_RESPONSE",
          status: response.status,
        },
      };
    }

    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "data" in parsed
    ) {
      return {
        data: (parsed as { data: T }).data ?? null,
        error: null,
      };
    }
    return {
      data: (parsed as T | null) ?? null,
      error: null,
    };
  } catch (err) {
    inFlightControllers.delete(controller);
    // Deliberately cancelled because the app was backgrounded — not a real
    // failure. Surface a distinct code so callers stay silent and refetch on
    // resume instead of flashing a "Request timed out" error.
    if (backgroundAborted.has(controller)) {
      backgroundAborted.delete(controller);
      return {
        data: null,
        error: {
          message: "Request cancelled.",
          code: "CANCELLED",
        },
      };
    }
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
  /**
   * When set, called on each request to resolve the API origin. Use for Expo dev (e.g. localhost:3000
   * when EXPO_PUBLIC_APP_URL is empty) so baseUrl matches config-bundle / WebView URLs.
   */
  getBaseUrl?: () => string;
  getAccessToken?: () => Promise<string | null>;
  /** Default headers sent with every request (e.g. X-App: provider for provider app). */
  headers?: Record<string, string>;
  /**
   * Per-request headers (e.g. active market ISO2 from device locale). Merged after static `headers`.
   * `path` is the request path (e.g. `/api/provider/profile`).
   */
  getDefaultHeaders?: (ctx: { path: string; method: string }) => Record<string, string>;
}

/**
 * Create an API client with baseUrl and optional auth.
 * Use in Expo apps to call apps/web APIs with Bearer token.
 */
export function createApiClient(config: ApiClientConfig) {
  const { baseUrl, getBaseUrl, getAccessToken, headers: defaultHeaders, getDefaultHeaders } = config;

  const request = <T>(
    path: string,
    options: Omit<RequestOptions, "baseUrl" | "getAccessToken"> = {}
  ) => {
    const method = String(options.method ?? "GET").toUpperCase();
    const dynamic = getDefaultHeaders?.({ path, method }) ?? {};
    const resolvedBase = getBaseUrl ? getBaseUrl() : baseUrl;
    return apiFetch<T>(path, {
      ...options,
      baseUrl: resolvedBase,
      getAccessToken,
      headers: {
        ...defaultHeaders,
        ...dynamic,
        ...(options.headers as Record<string, string>),
      },
    });
  };

  return {
    get: <T>(path: string, init?: ApiClientExtraOptions) =>
      request<T>(path, { ...init, method: "GET" }),
    post: <T>(path: string, body?: ApiClientRequestBody, init?: ApiClientExtraOptions) =>
      request<T>(path, { ...init, method: "POST", body }),
    put: <T>(path: string, body?: ApiClientRequestBody, init?: ApiClientExtraOptions) =>
      request<T>(path, { ...init, method: "PUT", body }),
    patch: <T>(path: string, body?: ApiClientRequestBody, init?: ApiClientExtraOptions) =>
      request<T>(path, { ...init, method: "PATCH", body }),
    delete: <T>(path: string, init?: ApiClientExtraOptions) =>
      request<T>(path, { ...init, method: "DELETE" }),
    fetch: request,
  };
}
