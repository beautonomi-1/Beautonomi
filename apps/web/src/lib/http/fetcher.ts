/**
 * HTTP Fetcher Utility
 * 
 * A typed fetch wrapper with:
 * - Timeout support (default 12s)
 * - AbortController for cancellation
 * - FormData and JSON body support
 * - Typed errors
 * - Automatic error handling
 */

export interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: Record<string, unknown> | FormData;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export class FetchError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

export class FetchTimeoutError extends Error {
  constructor(message: string = 'Request timeout') {
    super(message);
    this.name = 'FetchTimeoutError';
  }
}

const ADMIN_SCOPE_STORAGE_KEY = "admin_scope_mode";
const ADMIN_SCOPE_TENANT_STORAGE_KEY = "admin_scope_tenant_id";

/** Must match `STORAGE_KEY` in `ProviderPortalProvider.tsx`. */
const PROVIDER_PORTAL_CACHE_STORAGE_KEY = "provider_portal_cache_v2";
/** Must match `ACTIVE_PROVIDER_ID_HEADER` in `@/lib/supabase/api-helpers`. */
const ACTIVE_PROVIDER_ID_HEADER = "x-provider-id";

function looksLikeUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id.trim(),
  );
}

function isProviderApiUrl(url: string): boolean {
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const path = new URL(url, base).pathname;
    return path === "/api/provider" || path.startsWith("/api/provider/");
  } catch {
    return url === "/api/provider" || url.startsWith("/api/provider/");
  }
}

function readActiveProviderIdFromPortalCache(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(PROVIDER_PORTAL_CACHE_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { provider?: { id?: string } | null };
    const id =
      parsed?.provider && typeof parsed.provider.id === "string" ? parsed.provider.id.trim() : "";
    return looksLikeUuid(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Merge `x-provider-id` from portal sessionStorage for raw `fetch()` to `/api/provider/*`
 * (same hint as {@link fetchJson}). No-op on server or non-provider URLs.
 */
export function mergeProviderPortalFetchHeaders(
  url: string,
  headers?: HeadersInit,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (headers) {
    new Headers(headers).forEach((value, key) => {
      out[key] = value;
    });
  }
  if (typeof document !== "undefined" && isProviderApiUrl(url)) {
    const existing = out["x-provider-id"] ?? out["X-Provider-Id"];
    if (!existing) {
      const id = readActiveProviderIdFromPortalCache();
      if (id) out[ACTIVE_PROVIDER_ID_HEADER] = id;
    }
  }
  return out;
}

/** Same-origin `fetch` with multi-org header parity for `/api/provider/*`. */
export function providerPortalFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: mergeProviderPortalFetchHeaders(url, init?.headers),
  });
}

/** Path is `prefix` or `prefix/...`, not `prefix-other` (matches admin-api-client `matchesScopedPathPrefix`). */
function adminPathMatchesPrefix(url: string, prefix: string): boolean {
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const path = new URL(url, base).pathname;
    if (path === prefix) return true;
    return path.startsWith(`${prefix}/`);
  } catch {
    return url === prefix || url.startsWith(`${prefix}/`);
  }
}

function isScopedAdminCustomizationUrl(url: string): boolean {
  return (
    adminPathMatchesPrefix(url, "/api/admin/settings") ||
    adminPathMatchesPrefix(url, "/api/admin/integrations/paystack") ||
    adminPathMatchesPrefix(url, "/api/admin/content") ||
    adminPathMatchesPrefix(url, "/api/admin/email-templates") ||
    adminPathMatchesPrefix(url, "/api/admin/sms-templates") ||
    adminPathMatchesPrefix(url, "/api/admin/notification-templates") ||
    adminPathMatchesPrefix(url, "/api/admin/mapbox/config") ||
    adminPathMatchesPrefix(url, "/api/admin/maintenance") ||
    adminPathMatchesPrefix(url, "/api/admin/control-plane/integrations/gemini") ||
    adminPathMatchesPrefix(url, "/api/admin/control-plane/integrations/aura") ||
    adminPathMatchesPrefix(url, "/api/admin/control-plane/integrations/sumsub") ||
    adminPathMatchesPrefix(url, "/api/admin/subscription-plans") ||
    adminPathMatchesPrefix(url, "/api/admin/ecommerce")
  );
}

function withAdminScope(url: string, method: string, body?: Record<string, unknown> | FormData): {
  url: string;
  body?: Record<string, unknown> | FormData;
} {
  if (typeof window === "undefined" || !isScopedAdminCustomizationUrl(url)) {
    return { url, body };
  }

  const scope = window.localStorage.getItem(ADMIN_SCOPE_STORAGE_KEY) ?? "tenant";
  const tenantId = window.localStorage.getItem(ADMIN_SCOPE_TENANT_STORAGE_KEY) ?? "";
  if (scope !== "global" && scope !== "tenant") {
    return { url, body };
  }

  if (method.toUpperCase() === "GET") {
    const base = window.location.origin;
    const u = new URL(url, base);
    u.searchParams.set("scope", scope);
    if (scope === "tenant" && tenantId) {
      u.searchParams.set("tenant_id", tenantId);
    }
    return { url: `${u.pathname}${u.search}` };
  }

  if (!body || body instanceof FormData) {
    return { url, body };
  }

  return {
    url,
    body: {
      ...body,
      scope,
      ...(scope === "tenant" && tenantId ? { tenant_id: tenantId } : {}),
    },
  };
}

/**
 * HTTP status from fetch errors. Prefer over `instanceof FetchError` when throw/catch may use
 * different class identities (dynamic import + bundler chunking).
 */
export function getFetchErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const s = (error as { status?: unknown }).status;
  return typeof s === "number" ? s : undefined;
}

export function isNotFoundHttpError(error: unknown): boolean {
  return getFetchErrorStatus(error) === 404;
}

/** Next.js dev returned HTML (e.g. Turbopack not matching /api/.../[id]) instead of JSON. */
export function isHtmlRoutingFetchError(error: unknown): boolean {
  return (
    error instanceof FetchError &&
    (error.code === "NOT_FOUND_HTML" || error.code === "HTML_ERROR_RESPONSE")
  );
}

function isFetchTimeoutLike(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (error instanceof FetchTimeoutError) return true;
  const name = (error as { name?: string }).name;
  if (name === "FetchTimeoutError") return true;
  const m = String((error as Error).message || "").toLowerCase();
  return m.includes("timed out") || m.includes("timeout");
}

/** True when a failed request may succeed on retry (dev server restart, tab sleep, ECONNRESET, cold dev compile). */
export function isTransientNetworkFetchError(error: unknown): boolean {
  if (!error) return false;
  if (isFetchTimeoutLike(error)) return true;
  if (error instanceof FetchError) {
    if (error.code === "NETWORK_ERROR") return true;
    if (error.status === 0 && error.code === "UNKNOWN_ERROR") {
      const m = (error.message || "").toLowerCase();
      if (
        m.includes("econnreset") ||
        m.includes("aborted") ||
        m.includes("network") ||
        m.includes("failed to fetch")
      ) {
        return true;
      }
    }
  }
  if (error instanceof Error) {
    const m = error.message.toLowerCase();
    if (
      m.includes("econnreset") ||
      m.includes("network error") ||
      m.includes("failed to fetch") ||
      m.includes("load failed") ||
      m.includes("unable to reach")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Timeouts for server routes that often cold-compile in `next dev` (10s is routinely too low).
 * Production keeps a modest ceiling so hung APIs fail visibly.
 */
export const PROVIDER_BOOTSTRAP_TIMEOUT_MS =
  typeof process !== "undefined" && process.env.NODE_ENV === "development" ? 90_000 : 20_000;

/** Default for generic API reads: dev cold-compile + DB often exceed 10s. */
export const DEFAULT_FETCH_TIMEOUT_MS =
  typeof process !== "undefined" && process.env.NODE_ENV === "development" ? 60_000 : 25_000;

/**
 * Fetches JSON from an API endpoint with timeout and error handling
 * 
 * @param url - The API endpoint URL (relative or absolute)
 * @param options - Fetch options including method, body, headers, timeout
 * @returns Promise resolving to typed JSON response
 * @throws FetchError for HTTP errors, FetchTimeoutError for timeouts
 */
export async function fetchJson<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    body: originalBody,
    headers = {},
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    ...fetchOptions
  } = options;

  const scoped = withAdminScope(url, method, originalBody);
  url = scoped.url;
  const body = scoped.body;

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    // Debug logging removed
    controller.abort();
  }, timeoutMs);

  const requestStartTime = Date.now();
  try {
    // Prepare headers (includes x-provider-id for /api/provider/* when portal cache has id)
    const requestHeaders: HeadersInit = mergeProviderPortalFetchHeaders(url, headers);

    // Auto-inject CSRF token for mutation requests (POST/PUT/PATCH/DELETE)
    if (typeof document !== "undefined" && method !== "GET" && method !== "HEAD") {
      const csrfMatch = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
      if (csrfMatch?.[1]) {
        (requestHeaders as Record<string, string>)["x-csrf-token"] = csrfMatch[1];
      }
    }

    // Prepare body
    let requestBody: BodyInit | undefined;
    if (body) {
      if (body instanceof FormData) {
        // FormData - don't set Content-Type, browser will set it with boundary
        requestBody = body;
      } else {
        // JSON
        requestHeaders['Content-Type'] = 'application/json';
        requestBody = JSON.stringify(body);
      }
    }

    // Make request
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal: controller.signal,
      credentials: "same-origin",
      ...fetchOptions,
    });

    const _requestDuration = Date.now() - requestStartTime;
    // Debug logging removed

    // Clear timeout on success
    clearTimeout(timeoutId);

    // Handle non-OK responses
    if (!response.ok) {
      let errorData: { message?: string; code?: string; details?: unknown } = {};
      
      try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const jsonData = await response.json();
          const topMessage =
            typeof jsonData.message === "string" && jsonData.message.trim()
              ? jsonData.message.trim()
              : null;
          const permissionKey =
            typeof jsonData.permission === "string" && jsonData.permission.trim()
              ? jsonData.permission.trim()
              : "";

          // Handle both { error: "..." } and { error: { message: "..." } } formats.
          // Prefer top-level `message` when present (e.g. requirePermission 403).
          if (jsonData.error) {
            if (typeof jsonData.error === "string") {
              errorData.message = topMessage || jsonData.error;
            } else if (jsonData.error.message) {
              errorData.message = topMessage || jsonData.error.message;
              errorData.code = jsonData.error.code;
              errorData.details = jsonData.error.details;
            }
          } else if (jsonData.message) {
            errorData.message = jsonData.message;
            errorData.code = jsonData.code;
            errorData.details = jsonData.details;
          } else {
            errorData = jsonData;
          }

          if (
            permissionKey &&
            typeof errorData.message === "string" &&
            errorData.message &&
            !errorData.message.includes(permissionKey)
          ) {
            errorData.message = `${errorData.message}\n\nPermission: ${permissionKey}`;
          }
        } else {
          const textResponse = await response.text();
          const trimmed = textResponse.trim();
          // Next.js App Router not-found / error documents (e.g. Turbopack missing dynamic API routes in dev)
          if (
            trimmed.startsWith("<!DOCTYPE") ||
            trimmed.startsWith("<html") ||
            trimmed.includes("__next_f")
          ) {
            errorData.message =
              response.status === 404
                ? "API route not found: the server returned an HTML page instead of JSON. With Next.js 16 dev, use the Webpack dev server (pnpm dev in apps/web defaults to --webpack) so dynamic routes like /api/.../[id] resolve."
                : `Server returned HTML instead of JSON (HTTP ${response.status}).`;
            errorData.code =
              response.status === 404 ? "NOT_FOUND_HTML" : "HTML_ERROR_RESPONSE";
          } else {
            errorData.message = textResponse || `HTTP ${response.status}: ${response.statusText}`;
          }
        }
      } catch {
        // If we can't parse the error response, use status text
        errorData.message = `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`;
      }

      // Provide default messages for common status codes if no message is available
      if (!errorData.message) {
        switch (response.status) {
          case 401:
            errorData.message = 'Authentication required';
            errorData.code = 'UNAUTHORIZED';
            break;
          case 403:
            errorData.message = 'Access forbidden';
            errorData.code = 'FORBIDDEN';
            break;
          case 404:
            errorData.message = 'Resource not found';
            errorData.code = 'NOT_FOUND';
            break;
          case 409:
            errorData.message = 'Conflict: Resource already exists or is unavailable';
            errorData.code = 'CONFLICT';
            break;
          case 500:
            errorData.message = 'Internal server error';
            errorData.code = 'INTERNAL_ERROR';
            break;
          default:
            errorData.message = `Request failed with status ${response.status}`;
        }
      }

      throw new FetchError(
        errorData.message,
        response.status,
        errorData.code,
        errorData.details
      );
    }

    // Parse JSON response
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const jsonData = await response.json();
      // Debug logging removed
      return jsonData;
    }

    // If no JSON content type, return empty object (or handle as needed)
    return {} as T;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort (timeout or cancellation)
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted') || error.message.includes('signal is aborted'))) {
      // Check if it was a timeout or manual cancellation
      // If the signal was aborted, it's either a timeout or component unmount
      // For cancellations (not timeouts), we still throw FetchTimeoutError but mark it as cancelled
      // The error handlers and unhandled rejection handler will suppress it
      const wasTimeout = timeoutId !== null && controller.signal.aborted;
      const errorMessage = wasTimeout 
        ? `Request timed out after ${timeoutMs}ms`
        : 'Request was cancelled';
      // Convert to FetchTimeoutError - error handlers will suppress cancelled requests
      const timeoutError = new FetchTimeoutError(errorMessage);
      // Mark cancelled requests so they can be identified and suppressed
      if (!wasTimeout) {
        (timeoutError as any).__cancelled = true;
      }
      throw timeoutError;
    }

    // Re-throw FetchError as-is
    if (error instanceof FetchError) {
      throw error;
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new FetchError(
        'Network error: Unable to reach server',
        0,
        'NETWORK_ERROR'
      );
    }

    // Unknown error
    throw new FetchError(
      error instanceof Error ? error.message : 'Unknown error occurred',
      0,
      'UNKNOWN_ERROR'
    );
  }
}

/* ─── Client-side GET response cache ─── */

/** Client-only GET cache TTL. Time-sensitive routes should pass `{ staleTimeMs: 0 }` (e.g. availability, provider booking lists after edits). */
const DEFAULT_STALE_TIME_MS = 15_000;
const MAX_GET_CACHE_ENTRIES = 150;

interface GetCacheEntry {
  data: unknown;
  expiresAt: number;
}

const getResponseCache = new Map<string, GetCacheEntry>();
const inflightGetRequests = new Map<string, Promise<unknown>>();

function pruneGetCache(now: number): void {
  for (const [key, entry] of getResponseCache.entries()) {
    if (entry.expiresAt <= now) getResponseCache.delete(key);
  }
  if (getResponseCache.size <= MAX_GET_CACHE_ENTRIES) return;
  const overflow = getResponseCache.size - MAX_GET_CACHE_ENTRIES;
  let removed = 0;
  for (const key of getResponseCache.keys()) {
    getResponseCache.delete(key);
    if (++removed >= overflow) break;
  }
}

export function clearFetcherCache(): void {
  getResponseCache.clear();
  inflightGetRequests.clear();
}

export interface CachedGetOptions extends Omit<FetchOptions, 'method' | 'body'> {
  staleTimeMs?: number;
}

async function cachedGet<T = unknown>(url: string, options?: CachedGetOptions): Promise<T> {
  if (typeof window === "undefined") {
    return fetchJson<T>(url, { ...options, method: "GET" });
  }

  const staleMs = options?.staleTimeMs ?? DEFAULT_STALE_TIME_MS;
  const now = Date.now();
  const cached = getResponseCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.data as T;
  }

  const inflight = inflightGetRequests.get(url);
  if (inflight) return inflight as Promise<T>;

  const promise = fetchJson<T>(url, { ...options, method: "GET" }).then((data) => {
    getResponseCache.set(url, { data, expiresAt: Date.now() + staleMs });
    pruneGetCache(Date.now());
    inflightGetRequests.delete(url);
    return data;
  }).catch((err) => {
    inflightGetRequests.delete(url);
    throw err;
  });

  inflightGetRequests.set(url, promise);
  return promise;
}

/**
 * Convenience methods for common HTTP methods.
 * `get` uses a client-side cache with request deduplication.
 */
export const fetcher = {
  get: <T = unknown>(url: string, options?: CachedGetOptions) =>
    cachedGet<T>(url, options),

  post: <T = unknown>(url: string, body?: any, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchJson<T>(url, { ...options, method: 'POST', body }),

  patch: <T = unknown>(url: string, body?: any, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchJson<T>(url, { ...options, method: 'PATCH', body }),

  put: <T = unknown>(url: string, body?: any, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchJson<T>(url, { ...options, method: 'PUT', body }),

  delete: <T = unknown>(url: string, body?: any, options?: Omit<FetchOptions, 'method' | 'body'>) =>
    fetchJson<T>(url, { ...options, method: 'DELETE', body }),
};
