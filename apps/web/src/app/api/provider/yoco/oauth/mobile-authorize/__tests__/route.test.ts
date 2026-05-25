import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockAdminFrom = vi.fn();
const mockResolveTenant = vi.fn();
const mockFeatureEnabled = vi.fn();
const mockResolveOauthApp = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mockAdminFrom }),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenant(...args),
}));

vi.mock("@/lib/server/feature-flags", () => ({
  isFeatureEnabledServer: (...args: unknown[]) => mockFeatureEnabled(...args),
}));

vi.mock("@/lib/payments/yoco-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/yoco-oauth")>();
  return {
    ...actual,
    generateState: () => "state-123",
    resolveOauthApp: (...args: unknown[]) => mockResolveOauthApp(...args),
  };
});

function adminTable(table: string) {
  if (table === "provider_yoco_integrations") {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: { environment: "live", tenant_id: null },
          })),
        })),
      })),
    };
  }
  if (table === "yoco_oauth_states") {
    return {
      insert: vi.fn(async () => ({ error: null })),
    };
  }
  throw new Error(`Unexpected table ${table}`);
}

describe("POST /api/provider/yoco/oauth/mobile-authorize", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockGetSupabaseServer.mockResolvedValue({
      from: (table: string) => {
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { tenant_id: "tenant-1" }, error: null })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected server table ${table}`);
      },
    });
    mockAdminFrom.mockImplementation(adminTable);
    mockResolveTenant.mockResolvedValue("tenant-1");
    mockFeatureEnabled.mockResolvedValue(true);
    mockResolveOauthApp.mockResolvedValue({
      source: "env",
      tenantId: null,
      environment: "live",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUri: "https://app/api/provider/yoco/oauth/callback",
      defaultScopes: "openid business/webpos:read business/webpos:write",
    });
  });

  it("returns a Yoco authorize URL after authenticating the native app request", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("https://app/api/provider/yoco/oauth/mobile-authorize", {
        method: "POST",
        body: JSON.stringify({
          return_to: "/provider/settings/sales/yoco-integration?from=app",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.authorize_url).toContain("https://iam.yoco.com/oauth2/authorize");
    expect(json.data.authorize_url).toContain("state=state-123");
    expect(json.data.authorize_url).toContain("client_id=client-1");
  });

  it("blocks mobile OAuth when the rollout flag is off", async () => {
    mockFeatureEnabled.mockImplementation(async (key: string) => key === "payment_yoco");
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest("https://app/api/provider/yoco/oauth/mobile-authorize", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.code).toBe("YOCO_OAUTH_DISABLED");
  });
});
