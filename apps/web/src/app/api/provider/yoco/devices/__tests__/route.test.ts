import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockCheckYocoFeatureAccess = vi.fn();
const mockResolveCredentialMode = vi.fn();
const mockGetValidAccessToken = vi.fn();

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

vi.mock("@/lib/subscriptions/feature-access", () => ({
  checkYocoFeatureAccess: (...args: unknown[]) => mockCheckYocoFeatureAccess(...args),
}));

vi.mock("@/lib/payments/yoco-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/yoco-oauth")>();
  return {
    ...actual,
    resolveProviderCredentialMode: (...args: unknown[]) => mockResolveCredentialMode(...args),
    getValidAccessToken: (...args: unknown[]) => mockGetValidAccessToken(...args),
  };
});

function createSupabaseForDeviceList() {
  return {
    from: vi.fn((table: string) => {
      if (table === "provider_yoco_devices") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: [
                  {
                    id: "modern-1",
                    name: "Front desk",
                    yoco_device_id: "dev_modern_1",
                    location_id: null,
                    location_name: null,
                    is_active: true,
                    total_transactions: 3,
                    total_amount: 150000,
                    last_used: "2026-05-16T17:00:00.000Z",
                    created_at: "2026-05-16T16:00:00.000Z",
                    updated_at: "2026-05-16T17:00:00.000Z",
                  },
                ],
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "provider_yoco_terminals") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: [
                  // Duplicate by device_id should be deduped
                  {
                    id: "legacy-dup",
                    device_id: "dev_modern_1",
                    device_name: "Legacy duplicate",
                    location_name: "Main",
                    active: true,
                    created_at: "2026-05-16T12:00:00.000Z",
                  },
                  {
                    id: "legacy-1",
                    device_id: "legacy_device_22",
                    device_name: "Legacy terminal",
                    location_name: "Main",
                    active: true,
                    created_at: "2026-05-16T10:00:00.000Z",
                  },
                ],
                error: null,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table queried: ${table}`);
    }),
  };
}

describe("GET /api/provider/yoco/devices", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "provider-user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockGetSupabaseServer.mockResolvedValue(createSupabaseForDeviceList());
    mockCheckYocoFeatureAccess.mockResolvedValue({ enabled: true });
    mockResolveCredentialMode.mockResolvedValue({
      credentialMode: "oauth",
      environment: "live",
      isEnabled: true,
      hasSecretKey: false,
      hasOauthToken: true,
    });
    mockGetValidAccessToken.mockResolvedValue("oauth-jwt");
  });

  it("returns modern devices and non-duplicated legacy terminals", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/yoco/devices"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(2);

    const modern = body.data.find((d: { id: string }) => d.id === "modern-1");
    expect(modern?.device_id).toBe("dev_modern_1");
    expect(modern?.serial_number).toBe("dev_modern_1");
    expect(modern?.device_type).toBe("web_pos");

    const legacy = body.data.find((d: { id: string }) => d.id === "legacy-1");
    expect(legacy?.device_id).toBe("legacy_device_22");
    expect(legacy?.device_type).toBe("card_machine");
    expect(legacy?.legacy_terminal).toBe(true);
  });
});

describe("POST /api/provider/yoco/devices", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "u1" } });
    mockGetProviderIdForUser.mockResolvedValue("p1");
    mockCheckYocoFeatureAccess.mockResolvedValue({ enabled: true });
  });

  function jsonRequest(body: unknown) {
    return new NextRequest("http://localhost/api/provider/yoco/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function supabaseForInsert() {
    return {
      from: vi.fn((table: string) => {
        if (table === "provider_yoco_devices") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "dev-1",
                    name: "Front desk",
                    yoco_device_id: "yoco_id_1",
                    location_id: null,
                    location_name: null,
                    is_active: true,
                    credential_mode: "web_pos",
                    created_at: "2026-05-16T17:00:00.000Z",
                  },
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === "provider_locations") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null })),
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table queried: ${table}`);
      }),
    };
  }

  it("returns CREDENTIALS_REQUIRED when credential_mode is none", async () => {
    mockResolveCredentialMode.mockResolvedValue({
      credentialMode: "none",
      environment: "live",
      isEnabled: false,
      hasSecretKey: false,
      hasOauthToken: false,
    });
    mockGetSupabaseServer.mockResolvedValue(supabaseForInsert());
    const { POST } = await import("../route");
    const res = await POST(jsonRequest({ name: "Front desk" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("CREDENTIALS_REQUIRED");
  });

  it("creates a virtual device locally when credential_mode is 'checkout'", async () => {
    mockResolveCredentialMode.mockResolvedValue({
      credentialMode: "checkout",
      environment: "live",
      isEnabled: true,
      hasSecretKey: true,
      hasOauthToken: false,
    });
    mockGetSupabaseServer.mockResolvedValue(supabaseForInsert());
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("../route");
    const res = await POST(jsonRequest({ name: "Front desk" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.credential_mode).toBe("virtual_checkout");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls Yoco api.yoco.com with the OAuth Bearer when credential_mode is 'oauth'", async () => {
    mockResolveCredentialMode.mockResolvedValue({
      credentialMode: "oauth",
      environment: "live",
      isEnabled: true,
      hasSecretKey: false,
      hasOauthToken: true,
    });
    mockGetValidAccessToken.mockResolvedValue("jwt-x");
    mockGetSupabaseServer.mockResolvedValue(supabaseForInsert());

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: "yoco_id_1", name: "Front desk" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const { POST } = await import("../route");
    const res = await POST(jsonRequest({ name: "Front desk" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.credential_mode).toBe("web_pos");

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://api.yoco.com/v1/webpos/");
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Authorization: "Bearer jwt-x",
    });
    fetchSpy.mockRestore();
  });

  it("maps a Yoco 401 to YOCO_OAUTH_EXPIRED", async () => {
    mockResolveCredentialMode.mockResolvedValue({
      credentialMode: "oauth",
      environment: "live",
      isEnabled: true,
      hasSecretKey: false,
      hasOauthToken: true,
    });
    mockGetValidAccessToken.mockResolvedValue("jwt-x");
    mockGetSupabaseServer.mockResolvedValue(supabaseForInsert());
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "The provided credentials are invalid" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { POST } = await import("../route");
    const res = await POST(jsonRequest({ name: "Front desk" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("YOCO_OAUTH_EXPIRED");
  });
});

