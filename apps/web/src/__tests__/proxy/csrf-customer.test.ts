import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  })),
}));

const ORIGINAL_ENV = { ...process.env };

describe("proxy CSRF customer paths", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      CSRF_SECRET: "test-csrf-secret-for-unit-tests",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  async function load() {
    const [{ proxy }, { generateCsrfToken }] = await Promise.all([
      import("../../proxy"),
      import("@/lib/csrf"),
    ]);
    return { proxy, generateCsrfToken };
  }

  function apiRequest(path: string, init: { method: string; headers?: Record<string, string> }) {
    return new NextRequest(`https://www.beautonomi.com${path}`, {
      method: init.method,
      headers: {
        host: "www.beautonomi.com",
        "content-type": "application/json",
        ...init.headers,
      },
    });
  }

  it("allows cookie-less customer public POSTs (mobile guest / waitlist / gift claim)", async () => {
    const { proxy } = await load();
    for (const path of ["/api/public/waitlist", "/api/public/gift-cards/claim", "/api/mapbox/geocode"]) {
      const response = await proxy(apiRequest(path, { method: "POST" }));
      expect(response.status, path).not.toBe(403);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("allows customer Bearer mutations without an x-csrf-token", async () => {
    const { proxy } = await load();
    const request = apiRequest("/api/me/support-tickets", {
      method: "POST",
      headers: { authorization: "Bearer mobile-session-token" },
    });
    request.cookies.set("sb-test-auth-token", "session-payload");
    const response = await proxy(request);
    expect(response.status).not.toBe(403);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects logged-in cookie mutations that omit x-csrf-token", async () => {
    const { proxy } = await load();
    const request = apiRequest("/api/me/profile", { method: "PATCH" });
    request.cookies.set("sb-test-auth-token", "session-payload");
    const response = await proxy(request);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Invalid CSRF token" });
  });

  it("allows logged-in cookie mutations with a valid x-csrf-token", async () => {
    const { proxy, generateCsrfToken } = await load();
    const token = generateCsrfToken();
    const request = apiRequest("/api/me/profile", {
      method: "PATCH",
      headers: { "x-csrf-token": token },
    });
    request.cookies.set("sb-test-auth-token", "session-payload");
    const response = await proxy(request);
    expect(response.status).not.toBe(403);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("adds CORS headers on CSRF 403 so Expo web can read the error", async () => {
    const { proxy } = await load();
    const request = apiRequest("/api/me/profile", {
      method: "PATCH",
      headers: { origin: "http://localhost:8081" },
    });
    request.cookies.set("sb-test-auth-token", "session-payload");
    const response = await proxy(request);
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:8081");
  });
});
