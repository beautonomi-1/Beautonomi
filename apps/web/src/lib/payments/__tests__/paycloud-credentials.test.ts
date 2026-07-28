import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  resolvePaycloudContextForProvider,
  paycloudContextFailureToApiError,
} from "../paycloud-credentials";

const mockAdminFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

vi.mock("@/lib/payments/resolve-paycloud-app-credentials", () => ({
  resolvePaycloudAppCredentialsDetailed: vi.fn(),
}));

import { resolvePaycloudAppCredentialsDetailed } from "@/lib/payments/resolve-paycloud-app-credentials";

function userSupabase(terminal: Record<string, unknown> | null) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "paycloud_terminals") throw new Error(table);
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: terminal }),
      };
    }),
  } as never;
}

describe("resolvePaycloudContextForProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ctx when admin client resolves merchant and credentials", async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "paycloud_merchants") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              merchant_no: "M1",
              store_no: "S1",
              environment: "live",
              paycloud_app_id: "app-1",
              tenant_id: "t1",
              is_active: true,
            },
          }),
        };
      }
      throw new Error(table);
    });

    vi.mocked(resolvePaycloudAppCredentialsDetailed).mockResolvedValue({
      ok: true,
      credentials: {
        app_id: "a",
        app_rsa_private_key: "k",
        gateway_rsa_public_key: "pk",
      },
      appEnvironment: "live",
    });

    const result = await resolvePaycloudContextForProvider(
      userSupabase({
        id: "term-1",
        paycloud_merchant_id: "mer-1",
        provider_id: "prov-1",
        status: "active",
        is_active: true,
      }),
      "prov-1",
      "term-1",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.merchant_no).toBe("M1");
      expect(result.ctx.environment).toBe("live");
    }
  });

  it("returns TERMINAL_MISSING when terminal not found", async () => {
    const result = await resolvePaycloudContextForProvider(
      userSupabase(null),
      "prov-1",
      "term-1",
    );
    expect(result).toEqual({ ok: false, reason: "TERMINAL_MISSING" });
  });

  it("maps TEST_MODE_DISABLED to API error", () => {
    const err = paycloudContextFailureToApiError("TEST_MODE_DISABLED");
    expect(err.code).toBe("TEST_MODE_DISABLED");
    expect(err.message).toMatch(/test mode/i);
  });

  it("maps PLATFORM_CREDENTIALS_MISSING to API error", () => {
    const err = paycloudContextFailureToApiError("PLATFORM_CREDENTIALS_MISSING");
    expect(err.code).toBe("PLATFORM_CREDENTIALS_MISSING");
  });
});
