/**
 * Browser CSRF helpers for cookie-authenticated same-origin `/api` mutations.
 *
 * The customer (and provider) web apps mix `fetcher` with raw `fetch()`.
 * Installing this guard on `window.fetch` attaches `x-csrf-token` so those
 * call sites cannot 403 after login.
 *
 * Native apps are unaffected: they use Bearer tokens and `credentials: "omit"`.
 */

const CSRF_HEADER = "x-csrf-token";
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let inMemoryCsrfToken: string | null = null;
let csrfTokenFetchPromise: Promise<string | null> | null = null;
let nativeFetch: typeof fetch | null = null;

export function readCsrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function setInMemoryCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token?.trim() ? token.trim() : null;
}

export function getInMemoryCsrfToken(): string | null {
  return inMemoryCsrfToken;
}

function unwrappedFetch(): typeof fetch {
  if (nativeFetch) return nativeFetch;
  if (typeof window !== "undefined" && window.__bnNativeFetch) {
    nativeFetch = window.__bnNativeFetch;
    return nativeFetch;
  }
  return fetch.bind(globalThis);
}

export async function ensureCsrfToken(): Promise<string | null> {
  if (inMemoryCsrfToken) return inMemoryCsrfToken;
  const fromCookie = readCsrfTokenFromCookie();
  if (fromCookie) {
    inMemoryCsrfToken = fromCookie;
    return fromCookie;
  }
  if (typeof window === "undefined") return null;
  if (!csrfTokenFetchPromise) {
    csrfTokenFetchPromise = unwrappedFetch()("/api/csrf", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return null;
        const json = (await res.json()) as { token?: string };
        const token = json.token ?? readCsrfTokenFromCookie();
        if (token) setInMemoryCsrfToken(token);
        return token ?? null;
      })
      .catch(() => null)
      .finally(() => {
        csrfTokenFetchPromise = null;
      });
  }
  return csrfTokenFetchPromise;
}

function resolveUrl(input: RequestInfo | URL, base: string): URL | null {
  try {
    if (typeof input === "string") return new URL(input, base);
    if (input instanceof URL) return input;
    return new URL(input.url, base);
  } catch {
    return null;
  }
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return String(init.method).toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function headerValue(input: RequestInfo | URL, init: RequestInit | undefined, name: string): string | null {
  const fromInit = new Headers(init?.headers).get(name);
  if (fromInit) return fromInit;
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.headers.get(name);
  }
  return null;
}

export function shouldAttachCsrfHeader(input: RequestInfo | URL, init: RequestInit | undefined, origin: string): boolean {
  const method = resolveMethod(input, init);
  if (!MUTATION_METHODS.has(method)) return false;
  const url = resolveUrl(input, origin);
  if (!url) return false;
  if (url.origin !== origin) return false;
  if (!url.pathname.startsWith("/api")) return false;
  if (url.pathname === "/api/csrf" || url.pathname.startsWith("/api/csrf/")) return false;
  if (url.pathname.startsWith("/api/auth/")) return false;
  if (url.pathname.startsWith("/api/webhooks/")) return false;
  const authorization = headerValue(input, init, "authorization");
  if (authorization?.startsWith("Bearer ")) return false;
  if (headerValue(input, init, CSRF_HEADER)) return false;
  return true;
}

function mergeCsrfHeaders(input: RequestInfo | URL, init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  if (typeof Request !== "undefined" && input instanceof Request) {
    input.headers.forEach((value, key) => {
      if (!headers.has(key)) headers.set(key, value);
    });
  }
  headers.set(CSRF_HEADER, token);
  return { ...init, headers };
}

function looksLikeCsrfFailure(status: number, body: string): boolean {
  return status === 403 && body.toLowerCase().includes("csrf");
}

async function csrfAwareFetch(input: RequestInfo | URL, init?: RequestInit, csrfRetried = false): Promise<Response> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const attach = origin ? shouldAttachCsrfHeader(input, init, origin) : false;
  const retrySource =
    typeof Request !== "undefined" && input instanceof Request && attach && !csrfRetried
      ? input.clone()
      : input;

  let nextInit = init;
  if (attach) {
    const token = (await ensureCsrfToken()) ?? readCsrfTokenFromCookie();
    if (token) nextInit = mergeCsrfHeaders(input, init, token);
  }

  const doFetch = unwrappedFetch();
  const response = await doFetch(input, nextInit);
  if (csrfRetried || !attach || response.status !== 403) return response;

  const preview = await response.clone().text();
  if (!looksLikeCsrfFailure(response.status, preview)) return response;

  setInMemoryCsrfToken(null);
  const token = await ensureCsrfToken();
  if (!token) return response;
  return csrfAwareFetch(retrySource, mergeCsrfHeaders(retrySource, init, token), true);
}

export function installCsrfFetchGuard(): void {
  if (typeof window === "undefined") return;
  if (window.__bnCsrfFetchInstalled) {
    nativeFetch = window.__bnNativeFetch ?? nativeFetch;
    return;
  }
  window.__bnCsrfFetchInstalled = true;
  nativeFetch = window.fetch.bind(window);
  window.__bnNativeFetch = nativeFetch;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => csrfAwareFetch(input, init);
}

declare global {
  interface Window {
    __bnCsrfFetchInstalled?: boolean;
    __bnNativeFetch?: typeof fetch;
  }
}
