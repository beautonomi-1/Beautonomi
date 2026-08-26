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

function request(path: string, host = "www.beautonomi.com") {
  return new NextRequest(`https://${host}${path}`, {
    headers: { host },
  });
}

describe("proxy public EULA routes", () => {
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

  it("allows unauthenticated Partner EULA on .com without login redirect", async () => {
    const response = await proxy(request("/provider/eula"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(supabaseMocks.getUser).not.toHaveBeenCalled();
  });

  it("allows unauthenticated customer EULA on .co.za without login redirect", async () => {
    const response = await proxy(request("/customer/eula", "www.beautonomi.co.za"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(supabaseMocks.getUser).not.toHaveBeenCalled();
  });

  it("still requires login for other provider portal pages", async () => {
    const response = await proxy(request("/provider/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.beautonomi.com/?redirect=%2Fprovider%2Fdashboard&login=true",
    );
    expect(supabaseMocks.getUser).toHaveBeenCalled();
  });
});
