import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: supabaseMocks.getUser,
    },
  })),
}));

import { proxy } from "../../proxy";

const ORIGINAL_ENV = { ...process.env };

function request(path: string, host = "admin.beautonomi.com") {
  return new NextRequest(`https://${host}${path}`, {
    headers: { host },
  });
}

describe("proxy admin host routing", () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      ADMIN_HOST: "admin.beautonomi.com",
      ENABLE_ADMIN_HOST_ROUTING: "true",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      CSRF_SECRET: "test-secret",
    };
    supabaseMocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it("rewrites the admin host root to the existing admin app", async () => {
    const response = await proxy(request("/"));

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://admin.beautonomi.com/admin",
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(supabaseMocks.getUser).not.toHaveBeenCalled();
  });

  it("does not serve public marketplace pages from the admin host", async () => {
    const response = await proxy(request("/search"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://admin.beautonomi.com/admin");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("serves the admin login through the SPA shell, noindexed, without server auth", async () => {
    // Post-cutover: ADMIN_SPA_ROUTING defaults to SPA, so /admin/login is
    // rewritten to the Vite SPA shell which renders the login screen client-side.
    const response = await proxy(request("/admin/login"));

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://admin.beautonomi.com/admin/index.html",
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(supabaseMocks.getUser).not.toHaveBeenCalled();
  });

  it("serves unauthenticated admin pages via the SPA shell (client-side auth)", async () => {
    // Post-cutover: /admin/* rewrites to the SPA shell (HTTP 200). The shell holds
    // no sensitive data; the SPA performs the auth redirect client-side, and all
    // /api/admin/* data endpoints remain server-protected by requireAdminSection.
    const response = await proxy(request("/admin/dashboard"));

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://admin.beautonomi.com/admin/index.html",
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    // No server-side auth check — the SPA bootstrap handles it.
    expect(supabaseMocks.getUser).not.toHaveBeenCalled();
  });

  it("passes admin API requests through existing API handling", async () => {
    const response = await proxy(request("/api/admin/users"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(supabaseMocks.getUser).not.toHaveBeenCalled();
  });

  it("passes framework assets through on the admin host", async () => {
    const response = await proxy(request("/_next/static/chunks/app.js"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("leaves public routes on non-admin hosts unchanged", async () => {
    const response = await proxy(request("/search", "www.beautonomi.com"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects tenant admin pages to the canonical admin host", async () => {
    const response = await proxy(request("/admin/dashboard?section=users", "www.beautonomi.com"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://admin.beautonomi.com/admin/dashboard?section=users",
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(supabaseMocks.getUser).not.toHaveBeenCalled();
  });

  it("redirects regional tenant admin pages to the canonical admin host", async () => {
    const response = await proxy(request("/admin", "beautonomi.co.za"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://admin.beautonomi.com/admin");
  });

  it("does not redirect tenant admin APIs to the admin host", async () => {
    const response = await proxy(request("/api/admin/users", "www.beautonomi.com"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });
});
