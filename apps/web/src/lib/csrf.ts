import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
const SECRET = process.env.CSRF_SECRET || process.env.CRON_SECRET || "";

const CSRF_UNSET_MESSAGE =
  "CSRF_SECRET (or CRON_SECRET) is not set — CSRF protection is DISABLED for cookie-authenticated mutations. " +
  "Generate one with: openssl rand -hex 32";

/**
 * Production guard when CSRF_SECRET is unset. Keeps the existing warn and
 * escalates with console.error + optional Sentry.captureException.
 */
export function escalateUnsetCsrfSecret(input: {
  secret: string;
  nodeEnv: string | undefined;
  isServer: boolean;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  captureException?: (err: Error) => void;
}): boolean {
  if (input.secret) return false;
  if (input.nodeEnv !== "production") return false;
  if (input.isServer === false) return false;
  const message = CSRF_UNSET_MESSAGE;
  (input.warn ?? console.warn)(message);
  (input.error ?? console.error)(message);
  input.captureException?.(new Error("CSRF_SECRET (or CRON_SECRET) is not set in production"));
  return true;
}

// Client bundles import `getCsrfHeaders` from this module; env secrets are not
// available in the browser, so only escalate on the server (Node / Next 16 proxy).
if (typeof window === "undefined") {
  escalateUnsetCsrfSecret({
    secret: SECRET,
    nodeEnv: process.env.NODE_ENV,
    isServer: true,
    captureException: (err) => {
      void import("@sentry/nextjs")
        .then((Sentry) => {
          Sentry.captureException(err);
        })
        .catch(() => {});
    },
  });
}

export function generateCsrfToken(): string {
  const nonce = randomBytes(16).toString("hex");
  const sig = createHmac("sha256", SECRET).update(nonce).digest("hex");
  return `${nonce}.${sig}`;
}

export function verifyCsrfToken(token: string): boolean {
  if (!SECRET) return false;
  const [nonce, sig] = token.split(".");
  if (!nonce || !sig) return false;
  const expected = createHmac("sha256", SECRET).update(nonce).digest("hex");
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * True for Supabase SSR session cookies. PKCE `*-auth-token-code-verifier`
 * must not count — it is present during OAuth before a session exists.
 */
export function cookieLooksLikeSupabaseAuthSession(name: string, value?: string | null): boolean {
  if (!value) return false;
  if (!name.includes("auth-token")) return false;
  if (name.includes("code-verifier")) return false;
  return true;
}

export function requestHasAuthSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) =>
    cookieLooksLikeSupabaseAuthSession(cookie.name, cookie.value),
  );
}

/**
 * Validate CSRF token for cookie-authenticated mutations.
 * Bearer-authenticated requests (customer/provider mobile) are exempt — they
 * use `credentials: "omit"` and never send the session cookie.
 * Requests with no auth-session cookie are also exempt so public customer
 * POSTs (waitlist, ads, maintenance notify, geocode) are not blocked.
 * When no SECRET is configured, CSRF protection is disabled (tokens can't be
 * generated or verified without one).
 */
export function csrfCheck(request: NextRequest): NextResponse | null {
  if (!SECRET) return null;
  if (SAFE_METHODS.has(request.method)) return null;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return null;
  if (!requestHasAuthSessionCookie(request)) return null;

  const headerToken = request.headers.get(CSRF_HEADER);
  if (!headerToken) {
    console.warn("[csrf] missing_header", { path: request.nextUrl.pathname, method: request.method });
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  if (!verifyCsrfToken(headerToken)) {
    console.warn("[csrf] bad_signature", { path: request.nextUrl.pathname, method: request.method });
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  return null;
}

/**
 * Set a CSRF cookie on responses so the client can read it and
 * include it as a header on subsequent mutations.
 */
export function setCsrfCookie(response: NextResponse): NextResponse {
  const existing = response.cookies.get(CSRF_COOKIE);
  if (!existing && SECRET) {
    response.cookies.set(CSRF_COOKIE, generateCsrfToken(), {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }
  return response;
}

/**
 * Client-side helper: read the CSRF cookie and return a headers object
 * suitable for spreading into a fetch `headers` option.
 * Returns an empty object when running on the server or when no cookie exists.
 */
export function getCsrfHeaders(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  const raw = match?.[1]?.trim();
  if (!raw) return {};
  try {
    return { [CSRF_HEADER]: decodeURIComponent(raw) };
  } catch {
    return { [CSRF_HEADER]: raw };
  }
}
