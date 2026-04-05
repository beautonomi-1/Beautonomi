import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockFetchScopedSingle = vi.fn();
const mockCreateClient = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) =>
    mockResolveTenantIdWithZaFallback(...args),
}));

vi.mock("@/lib/tenant/scoped-overrides", () => ({
  fetchScopedSingle: (...args: unknown[]) => mockFetchScopedSingle(...args),
}));

vi.mock("@/lib/mapbox/geocodeProviderLocation", () => ({
  geocodeProviderLocation: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

describe("POST /api/provider/onboarding", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates provider with tenant_id and tenant-scoped travel currency defaults", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-1", role: "customer" },
    });
    mockGetSupabaseServer.mockResolvedValue({});
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-uk");
    mockFetchScopedSingle.mockResolvedValue({
      data: {
        settings: {
          features: { auto_approve_providers: true },
          travel_fees: {
            default_rate_per_km: 9,
            default_minimum_fee: 25,
            default_maximum_fee: null,
            default_currency: "GBP",
          },
        },
      },
      source: "tenant",
    });

    const providersInsertPayloads: Array<Record<string, unknown>> = [];
    const zoneSelectionInsertPayloads: Array<Array<Record<string, unknown>>> = [];

    const mockSupabaseAdmin = {
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(),
          getPublicUrl: vi.fn(),
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "providers") {
          let filters: Record<string, unknown> = {};
          let insertPayload: Record<string, unknown> | null = null;
          return {
            select: vi.fn(() => ({
              eq: vi.fn((column: string, value: unknown) => {
                filters[column] = value;
                return {
                  maybeSingle: vi.fn(async () => {
                    // No existing provider and slug is unique.
                    if (column === "user_id" || column === "slug") {
                      return { data: null, error: null };
                    }
                    return { data: null, error: null };
                  }),
                };
              }),
            })),
            insert: vi.fn((payload: Record<string, unknown>) => {
              insertPayload = payload;
              providersInsertPayloads.push(payload);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: "provider-1", ...insertPayload },
                    error: null,
                  })),
                })),
              };
            }),
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }

        if (table === "tenants") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { default_currency: "GBP" },
                  error: null,
                })),
              })),
            })),
          };
        }

        if (table === "users") {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }

        if (table === "provider_locations") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: "location-1" },
                  error: null,
                })),
              })),
            })),
          };
        }

        if (table === "provider_global_category_associations") {
          return {
            insert: vi.fn(async () => ({ error: null })),
          };
        }

        if (table === "global_categories") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({ data: [], error: null })),
            })),
          };
        }

        if (table === "provider_zone_selections") {
          return {
            insert: vi.fn(async (payload: Array<Record<string, unknown>>) => {
              zoneSelectionInsertPayloads.push(payload);
              return { error: null };
            }),
          };
        }

        if (table === "provider_onboarding_drafts") {
          return {
            delete: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    mockCreateClient.mockReturnValue(mockSupabaseAdmin);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/onboarding", {
      method: "POST",
      body: JSON.stringify({
        business_name: "Glow Studio",
        business_type: "salon",
        address: {
          line1: "1 Main Road",
          city: "London",
          country: "GB",
          latitude: 51.5074,
          longitude: -0.1278,
        },
        global_category_ids: ["11111111-1111-4111-8111-111111111111"],
        selected_zone_ids: ["22222222-2222-4222-8222-222222222222"],
        operating_hours: {},
        services: [],
      }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.data?.provider?.id).toBe("provider-1");

    expect(providersInsertPayloads[0]?.tenant_id).toBe("tenant-uk");
    expect(zoneSelectionInsertPayloads[0]?.[0]?.currency).toBe("GBP");
  }, 15000);
});

