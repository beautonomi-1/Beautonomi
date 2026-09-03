import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

describe("csrfCheck", () => {
  const originalSecret = process.env.CSRF_SECRET;
  const originalCron = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    process.env.CSRF_SECRET = "test-csrf-secret-for-unit-tests";
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CSRF_SECRET;
    else process.env.CSRF_SECRET = originalSecret;
    if (originalCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCron;
  });

  async function loadCsrf() {
    return import("@/lib/csrf");
  }

  async function makeValidToken() {
    const { generateCsrfToken } = await loadCsrf();
    return generateCsrfToken();
  }

  function withSessionCookie(request: NextRequest): NextRequest {
    request.cookies.set("sb-test-auth-token", "session-payload");
    return request;
  }

  it("exempts cookie-less mutations (customer mobile and public POSTs)", async () => {
    const { csrfCheck } = await loadCsrf();
    const request = new NextRequest("http://localhost/api/public/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(csrfCheck(request)).toBeNull();
  });

  it("does not treat PKCE code-verifier cookies as a session", async () => {
    const { csrfCheck } = await loadCsrf();
    const request = new NextRequest("http://localhost/api/public/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    request.cookies.set("sb-test-auth-token-code-verifier", "pkce");
    expect(csrfCheck(request)).toBeNull();
  });

  it("returns 403 when a cookie session mutation has no x-csrf-token header", async () => {
    const { csrfCheck } = await loadCsrf();
    const request = withSessionCookie(
      new NextRequest("http://localhost/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = csrfCheck(request);
    expect(result?.status).toBe(403);
    const body = await result!.json();
    expect(body.error).toBe("Invalid CSRF token");
  });

  it("passes when a cookie session mutation includes a valid x-csrf-token", async () => {
    const { csrfCheck } = await loadCsrf();
    const token = await makeValidToken();
    const request = withSessionCookie(
      new NextRequest("http://localhost/api/me/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": token,
        },
      }),
    );
    expect(csrfCheck(request)).toBeNull();
  });

  it("exempts Bearer-authenticated mutations even when a session cookie is present", async () => {
    const { csrfCheck } = await loadCsrf();
    const request = withSessionCookie(
      new NextRequest("http://localhost/api/me/profile", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer mobile-session-token",
          "Content-Type": "application/json",
        },
      }),
    );
    expect(csrfCheck(request)).toBeNull();
  });

  it("exempts Bearer-authenticated mutations", async () => {
    const { csrfCheck } = await loadCsrf();
    const request = new NextRequest("http://localhost/api/me/profile", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer mobile-session-token",
        "Content-Type": "application/json",
      },
    });
    expect(csrfCheck(request)).toBeNull();
  });

  it("exempts safe methods (GET, HEAD, OPTIONS)", async () => {
    const { csrfCheck } = await loadCsrf();
    for (const method of ["GET", "HEAD", "OPTIONS"] as const) {
      const request = withSessionCookie(new NextRequest("http://localhost/api/me/profile", { method }));
      expect(csrfCheck(request)).toBeNull();
    }
  });

  it("rejects an invalid token on a cookie session", async () => {
    const { csrfCheck } = await loadCsrf();
    const request = withSessionCookie(
      new NextRequest("http://localhost/api/me/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": "bad.nonce",
        },
      }),
    );
    const result = csrfCheck(request);
    expect(result?.status).toBe(403);
  });
});

describe("escalateUnsetCsrfSecret", () => {
  it("warns, errors, and captures when CSRF_SECRET is unset in production", async () => {
    const { escalateUnsetCsrfSecret } = await import("@/lib/csrf");
    const warn = vi.fn();
    const error = vi.fn();
    const captureException = vi.fn();
    const escalated = escalateUnsetCsrfSecret({
      secret: "",
      nodeEnv: "production",
      isServer: true,
      warn,
      error,
      captureException,
    });
    expect(escalated).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/CSRF_SECRET/);
    expect(error).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it("does not escalate when a secret is present", async () => {
    const { escalateUnsetCsrfSecret } = await import("@/lib/csrf");
    const warn = vi.fn();
    const error = vi.fn();
    const captureException = vi.fn();
    expect(
      escalateUnsetCsrfSecret({
        secret: "present",
        nodeEnv: "production",
        isServer: true,
        warn,
        error,
        captureException,
      }),
    ).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });
});
