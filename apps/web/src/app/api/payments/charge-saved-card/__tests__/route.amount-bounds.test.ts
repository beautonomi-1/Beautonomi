/**
 * F-07: free-form `body.amount` on charge-saved-card (used only when no
 * entity is in metadata) must be bounded — positive, ≤ 2dp, capped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return { ...actual, requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args) };
});
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => ({ from: mockFrom })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: mockFrom })),
}));
vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/tenant/market-availability", () => ({
  assertTransactionalMarketAllowedForTenantId: vi.fn(async () => null),
}));
vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));
vi.mock("@/lib/payments/provider/registry", () => ({
  getPaymentProviderForTenant: vi.fn(async () => ({ provider: { id: "paystack" } })),
}));
vi.mock("@/lib/http/idempotency", () => ({
  extractIdempotencyKey: vi.fn(() => null),
  lookupIdempotentResponse: vi.fn(async () => null),
  rememberIdempotentResponse: vi.fn(async () => undefined),
}));

function post(body: unknown) {
  return new NextRequest("http://localhost/api/payments/charge-saved-card", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/payments/charge-saved-card — free-form amount bounds (F-07)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1", email: "u@test.com" } });
    mockFrom.mockImplementation(() => {
      throw new Error("DB should not be reached for an invalid amount");
    });
  });

  it("rejects an absurdly large free-form amount with 400", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      post({
        payment_method_id: "11111111-1111-4111-8111-111111111111",
        email: "u@test.com",
        amount: 1_000_000_000,
      }),
    );
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects fractional-cent free-form amounts", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      post({
        payment_method_id: "11111111-1111-4111-8111-111111111111",
        email: "u@test.com",
        amount: 12.345,
      }),
    );
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
