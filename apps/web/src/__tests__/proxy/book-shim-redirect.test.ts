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

function request(path: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { host: "localhost:3000" },
  });
}

describe("proxy legacy /book/{slug} redirect", () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
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

  it("308-redirects /book/{slug} to /booking?slug=… and preserves query", async () => {
    const response = await proxy(
      request("/book/e2e-test-provider-beautonomi?service=svc-1"),
    );

    expect(response.status).toBe(308);
    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    const url = new URL(location!);
    expect(url.pathname).toBe("/booking");
    expect(url.searchParams.get("slug")).toBe("e2e-test-provider-beautonomi");
    expect(url.searchParams.get("service")).toBe("svc-1");
  });

  it("does not redirect /book/l/{linkSlug}", async () => {
    const response = await proxy(request("/book/l/my-link"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("allows unauthenticated GET /checkout (legacy redirect entry)", async () => {
    const response = await proxy(request("/checkout?provider=foo"));

    expect(response.status).not.toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).not.toContain("login=true");
  });

  it("allows unauthenticated GET /auth/callback", async () => {
    const response = await proxy(request("/auth/callback?code=abc"));

    expect(response.status).not.toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).not.toContain("login=true");
  });
});
