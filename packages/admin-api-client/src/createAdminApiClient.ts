import { mergeAdminScopeIntoJsonBody, withAdminScopeUrl } from "./adminScope";
import { AdminApiError, isForbiddenStatus, isUnauthorizedStatus } from "./errors";
import { adminBootstrapSchema, type AdminBootstrap } from "./schemas/bootstrap";

/** Matches `apps/web` middleware CSRF check: cookie session + mutation requires header (Bearer exempt). */
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Matches `apps/web` src/lib/http/fetcher.ts — same regex and raw cookie substring for the header value */
function csrfHeadersFromCookie(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match?.[1] ? { [CSRF_HEADER]: match[1] } : {};
}

function attachCsrfForCookieMutations(headers: Headers, method: string, hasBearerAuth: boolean): void {
  if (SAFE_METHODS.has(method)) return;
  if (hasBearerAuth) return;
  if (headers.has(CSRF_HEADER)) return;
  const csrf = csrfHeadersFromCookie();
  for (const [k, v] of Object.entries(csrf)) {
    headers.set(k, v);
  }
}

export interface AdminApiClientOptions {
  /** e.g. "" when using same-origin + Vite proxy */
  baseUrl?: string;
  getAccessToken?: () => string | null;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: string | null;
}

function joinUrl(base: string, path: string): string {
  if (!base) return path;
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export function createAdminApiClient(options: AdminApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? "";
  /** Vite dev serves HTML without Next proxy — csrf cookie only appears after a `/api` GET; dedupe concurrent primes */
  let csrfPrimeInflight: Promise<void> | null = null;

  async function ensureCsrfCookieBeforeMutation(
    method: string,
    hasBearerAuth: boolean,
    headers: Headers
  ): Promise<void> {
    if (SAFE_METHODS.has(method)) return;
    if (hasBearerAuth) return;
    if (headers.has(CSRF_HEADER)) return;
    if (Object.keys(csrfHeadersFromCookie()).length > 0) return;

    if (!csrfPrimeInflight) {
      const pingUrl = joinUrl(baseUrl, "/api/admin/bootstrap");
      csrfPrimeInflight = fetch(pingUrl, { method: "GET", credentials: "include" })
        .then(() => {})
        .catch(() => {})
        .finally(() => {
          csrfPrimeInflight = null;
        });
    }
    await csrfPrimeInflight;
  }

  async function requestJson<T>(
    path: string,
    init: RequestInit & { timeoutMs?: number; unwrapData?: boolean } = {}
  ): Promise<T> {
    const unwrapData = init.unwrapData ?? true;
    const method = (init.method ?? "GET").toUpperCase();
    let urlPath = path.startsWith("/") ? path : `/${path}`;
    urlPath = withAdminScopeUrl(urlPath, method);
    const url = joinUrl(baseUrl, urlPath);
    const controller = new AbortController();
    const timeoutMs = init.timeoutMs ?? 60000;
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    const token = options.getAccessToken?.();
    const hasBearerAuth = Boolean(token);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    await ensureCsrfCookieBeforeMutation(method, hasBearerAuth, headers);
    attachCsrfForCookieMutations(headers, method, hasBearerAuth);
    const { timeoutMs: _omit, unwrapData: _unwrap, ...fetchInit } = init;
    try {
      const res = await fetch(url, {
        ...fetchInit,
        headers,
        credentials: "include",
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T> & Record<string, unknown>;

      if (!res.ok) {
        const errField = json?.error;
        const nestedMsg =
          errField &&
          typeof errField === "object" &&
          "message" in errField &&
          typeof (errField as { message: unknown }).message === "string"
            ? (errField as { message: string }).message
            : null;
        const msg =
          typeof errField === "string"
            ? errField
            : nestedMsg
              ? nestedMsg
              : typeof (json as { message?: string }).message === "string"
                ? (json as { message: string }).message
                : `Request failed (${res.status})`;
        const nestedCode =
          errField &&
          typeof errField === "object" &&
          "code" in errField &&
          typeof (errField as { code: unknown }).code === "string"
            ? (errField as { code: string }).code
            : undefined;
        throw new AdminApiError(msg, res.status, nestedCode);
      }

      if (json.error) {
        const errField = json.error;
        const msg =
          typeof errField === "string"
            ? errField
            : errField &&
                typeof errField === "object" &&
                "message" in errField &&
                typeof (errField as { message: unknown }).message === "string"
              ? (errField as { message: string }).message
              : String(errField);
        const code =
          errField &&
          typeof errField === "object" &&
          "code" in errField &&
          typeof (errField as { code: unknown }).code === "string"
            ? (errField as { code: string }).code
            : undefined;
        throw new AdminApiError(msg, res.status, code);
      }

      if (unwrapData && json.data !== undefined) {
        return json.data as T;
      }
      return json as T;
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchBinary(
    path: string,
    init: RequestInit & { timeoutMs?: number } = {}
  ): Promise<Blob> {
    const method = (init.method ?? "GET").toUpperCase();
    let urlPath = path.startsWith("/") ? path : `/${path}`;
    urlPath = withAdminScopeUrl(urlPath, method);
    const url = joinUrl(baseUrl, urlPath);
    const controller = new AbortController();
    const timeoutMs = init.timeoutMs ?? 60000;
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers(init.headers);
    const token = options.getAccessToken?.();
    const hasBearerAuth = Boolean(token);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    await ensureCsrfCookieBeforeMutation(method, hasBearerAuth, headers);
    attachCsrfForCookieMutations(headers, method, hasBearerAuth);
    const { timeoutMs: _omit, ...fetchInit } = init;
    try {
      const res = await fetch(url, {
        ...fetchInit,
        method,
        headers,
        credentials: "include",
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let msg = `Request failed (${res.status})`;
        if (text) {
          try {
            const json = JSON.parse(text) as ApiEnvelope<unknown> & { message?: string };
            if (typeof json.message === "string") msg = json.message;
            else if (typeof json.error === "string") msg = json.error;
            else if (
              json.error &&
              typeof json.error === "object" &&
              json.error !== null &&
              "message" in json.error
            ) {
              const m = (json.error as { message?: unknown }).message;
              if (typeof m === "string") msg = m;
            }
          } catch {
            if (text.length > 0 && text.length < 300) msg = text;
          }
        }
        throw new AdminApiError(msg, res.status);
      }
      return res.blob();
    } finally {
      clearTimeout(t);
    }
  }

  return {
    async getBootstrap(): Promise<AdminBootstrap> {
      const raw = await requestJson<unknown>("/api/admin/bootstrap", { method: "GET", timeoutMs: 15000 });
      const parsed = adminBootstrapSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AdminApiError("Invalid bootstrap response", 500);
      }
      return parsed.data;
    },

    async getJson<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
      return requestJson<T>(path, { ...init, method: init?.method ?? "GET" });
    },

    /**
     * Full JSON body after success (no `data` unwrap). Use for routes that return `{ data, meta }` at the top level
     * where the client must read `meta` (e.g. some payout/list handlers).
     */
    async getRawJson<T extends Record<string, unknown> = Record<string, unknown>>(
      path: string,
      init?: RequestInit & { timeoutMs?: number }
    ): Promise<T> {
      return requestJson<T>(path, { ...init, method: init?.method ?? "GET", unwrapData: false });
    },

    async postJson<T>(path: string, body?: unknown, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
      const merged =
        body === undefined ? undefined : mergeAdminScopeIntoJsonBody(path, "POST", body);
      return requestJson<T>(path, {
        ...init,
        method: "POST",
        body: merged === undefined ? undefined : JSON.stringify(merged),
      });
    },

    async patchJson<T>(path: string, body?: unknown, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
      const merged =
        body === undefined ? undefined : mergeAdminScopeIntoJsonBody(path, "PATCH", body);
      return requestJson<T>(path, {
        ...init,
        method: "PATCH",
        body: merged === undefined ? undefined : JSON.stringify(merged),
      });
    },

    async deleteJson<T>(path: string, body?: unknown, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
      return requestJson<T>(path, {
        ...init,
        method: "DELETE",
        body: body !== undefined ? JSON.stringify(body) : undefined,
        ...(body !== undefined ? { headers: { "Content-Type": "application/json", ...((init?.headers as Record<string, string>) ?? {}) } } : {}),
      });
    },

    async putJson<T>(path: string, body?: unknown, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
      const merged =
        body === undefined ? undefined : mergeAdminScopeIntoJsonBody(path, "PUT", body);
      return requestJson<T>(path, {
        ...init,
        method: "PUT",
        body: merged === undefined ? undefined : JSON.stringify(merged),
      });
    },

    /**
     * Binary download (CSV, etc.) with the same **GET scope injection** and credentials as `getJson`.
     */
    async downloadBlob(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<Blob> {
      return fetchBinary(path, { ...init, method: init?.method ?? "GET" });
    },

    isUnauthorizedStatus,
    isForbiddenStatus,
  };
}

export type AdminApiClient = ReturnType<typeof createAdminApiClient>;
