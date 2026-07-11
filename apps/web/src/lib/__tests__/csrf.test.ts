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

  it("returns 403 when mutation has no x-csrf-token header", async () => {
    const { csrfCheck } = await loadCsrf();
    const request = new NextRequest("http://localhost/api/me/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    });
    const result = csrfCheck(request);
    expect(result?.status).toBe(403);
    const body = await result!.json();
    expect(body.error).toBe("Invalid CSRF token");
  });

  it("passes when mutation includes a valid x-csrf-token", async () => {
    const { csrfCheck } = await loadCsrf();
    const token = await makeValidToken();
    const request = new NextRequest("http://localhost/api/me/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": token,
      },
    });
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
      const request = new NextRequest("http://localhost/api/me/profile", { method });
      expect(csrfCheck(request)).toBeNull();
    }
  });

  it("rejects an invalid token", async () => {
    const { csrfCheck } = await loadCsrf();
    const request = new NextRequest("http://localhost/api/me/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": "bad.nonce",
      },
    });
    const result = csrfCheck(request);
    expect(result?.status).toBe(403);
  });
});
