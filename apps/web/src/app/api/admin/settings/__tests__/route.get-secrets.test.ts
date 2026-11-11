/**
 * F2-62: GET /api/admin/settings must never echo env secrets
 * (PAYSTACK_SECRET_KEY / PAYSTACK_WEBHOOK_SECRET) in the default settings
 * returned when no platform_settings row exists. Masked placeholders only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

const FAKE_SECRET = "sk_test_SYNTHETIC_DO_NOT_USE_000000";
const FAKE_WEBHOOK_SECRET = "whsec_SYNTHETIC_DO_NOT_USE_000000";

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSection: vi.fn(async () => ({ user: MOCK_USERS.superadmin })),
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: vi.fn() })),
}));
vi.mock("@/lib/tenant/scoped-overrides", () => ({
  resolveAdminTenantContext: vi.fn(async () => ({ currentTenantId: "tenant-1" })),
  // No platform_settings row → route falls back to defaults.
  fetchScopedSingle: vi.fn(async () => ({ data: null, error: null })),
}));
vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));
vi.mock("@/lib/audit/audit", () => ({ writeAuditLog: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

describe("GET /api/admin/settings — env secrets are never echoed (F2-62)", () => {
  beforeEach(() => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", FAKE_SECRET);
    vi.stubEnv("PAYSTACK_WEBHOOK_SECRET", FAKE_WEBHOOK_SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("default settings mask env-configured Paystack secrets instead of returning them", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/admin/settings"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(FAKE_SECRET);
    expect(text).not.toContain(FAKE_WEBHOOK_SECRET);

    const body = JSON.parse(text);
    expect(body.data.paystack.secret_key).toBe("***");
    expect(body.data.paystack.webhook_secret).toBe("***");
  });

  it("default settings report empty when no env secret is configured", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    vi.stubEnv("PAYSTACK_WEBHOOK_SECRET", "");
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/admin/settings"));
    const body = await res.json();
    expect(body.data.paystack.secret_key).toBe("");
    expect(body.data.paystack.webhook_secret).toBeUndefined();
  });
});
