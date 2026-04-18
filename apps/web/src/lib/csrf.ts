import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
const SECRET = process.env.CSRF_SECRET || process.env.CRON_SECRET || "";

// Client bundles import `getCsrfHeaders` from this module; env secrets are not
// available in the browser, so only warn on the server (Node / Next 16 proxy).
if (
  !SECRET &&
  process.env.NODE_ENV === "production" &&
  typeof window === "undefined"
) {
  console.warn(
    "CSRF_SECRET (or CRON_SECRET) is not set — CSRF protection is DISABLED for cookie-authenticated mutations. " +
      "Generate one with: openssl rand -hex 32",
  );
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
 * Validate CSRF token for cookie-authenticated mutations.
 * Bearer-authenticated requests (mobile) are exempt since they don't use cookies.
 * When no SECRET is configured, CSRF protection is disabled (tokens can't be
 * generated or verified without one).
 */
export function csrfCheck(request: NextRequest): NextResponse | null {
  if (!SECRET) return null;
  if (SAFE_METHODS.has(request.method)) return null;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return null;

  const headerToken = request.headers.get(CSRF_HEADER);
  if (!headerToken || !verifyCsrfToken(headerToken)) {
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
      sameSite: "strict",
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
  return match?.[1] ? { [CSRF_HEADER]: match[1] } : {};
}
