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
          const filters: Record<string, unknown> = {};
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

        if (table === "provider_onboarding_tracking") {
          return {
            upsert: vi.fn(async () => ({ error: null })),
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }

        if (table === "provider_leads") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  or: vi.fn(() => ({
                    limit: vi.fn(async () => ({ data: [], error: null })),
                  })),
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }

        if (table === "provider_lead_activities") {
          return {
            insert: vi.fn(async () => ({ error: null })),
          };
        }

        if (table === "provider_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
            insert: vi.fn(async () => ({ error: null })),
          };
        }

        if (table === "subscription_plans") {
          const planRow = { data: { id: "00000000-0000-4000-8000-000000000001" }, error: null };
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => planRow),
                    })),
                  })),
                })),
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => planRow),
                })),
              })),
            })),
          };
        }

        if (table === "offerings") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [], error: null })),
            })),
          };
        }

        if (table === "service_addons") {
          return {
            insert: vi.fn(async () => ({ error: null })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: vi.fn(async () => ({ data: null, error: { message: "does not exist" } })),
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
  }, 45_000);

  it("maps onboarding global categories to provider categories and persists addons", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-2", role: "customer" },
    });
    mockGetSupabaseServer.mockResolvedValue({});
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockFetchScopedSingle.mockResolvedValue({
      data: {
        settings: {
          features: { auto_approve_providers: true },
        },
      },
      source: "tenant",
    });

    const offeringsInsertPayloads: Array<Array<Record<string, unknown>>> = [];
    const addonInsertPayloads: Array<Array<Record<string, unknown>>> = [];
    const providerCategoryInsertPayloads: Array<Record<string, unknown>> = [];

    const mockSupabaseAdmin = {
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(),
          getPublicUrl: vi.fn(),
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "providers") {
          let insertPayload: Record<string, unknown> | null = null;
          return {
            select: vi.fn(() => ({
              eq: vi.fn((column: string) => ({
                maybeSingle: vi.fn(async () => {
                  if (column === "user_id" || column === "slug") return { data: null, error: null };
                  return { data: null, error: null };
                }),
              })),
            })),
            insert: vi.fn((payload: Record<string, unknown>) => {
              insertPayload = payload;
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: "provider-2", ...insertPayload }, error: null })),
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
                  data: { default_currency: "ZAR" },
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
                  data: { id: "location-2" },
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
              in: vi.fn(async () => ({
                data: [
                  { id: "11111111-1111-4111-8111-111111111111", name: "Hair", slug: "hair" },
                ],
                error: null,
              })),
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: "11111111-1111-4111-8111-111111111111", name: "Hair", slug: "hair" },
                  error: null,
                })),
              })),
            })),
          };
        }

        if (table === "provider_categories") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(async () => ({ data: [], error: null })),
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: { display_order: 1 }, error: null })),
                  })),
                })),
              })),
            })),
            insert: vi.fn((payload: Record<string, unknown>) => {
              providerCategoryInsertPayloads.push(payload);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: "provider-category-1", slug: "hair" },
                    error: null,
                  })),
                })),
              };
            }),
          };
        }

        if (table === "offerings") {
          return {
            insert: vi.fn((payload: Array<Record<string, unknown>>) => {
              offeringsInsertPayloads.push(payload);
              return {
                select: vi.fn(async () => ({
                  data: payload.map((item, idx) => ({ id: `offering-${idx + 1}`, ...item })),
                  error: null,
                })),
              };
            }),
          };
        }

        if (table === "service_addons") {
          return {
            insert: vi.fn(async (payload: Array<Record<string, unknown>>) => {
              addonInsertPayloads.push(payload);
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

        if (table === "provider_onboarding_tracking") {
          return {
            upsert: vi.fn(async () => ({ error: null })),
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }

        if (table === "provider_leads") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  or: vi.fn(() => ({
                    limit: vi.fn(async () => ({ data: [], error: null })),
                  })),
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }

        if (table === "provider_lead_activities") {
          return {
            insert: vi.fn(async () => ({ error: null })),
          };
        }

        if (table === "provider_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
            insert: vi.fn(async () => ({ error: null })),
          };
        }

        if (table === "subscription_plans") {
          const planRow = { data: { id: "00000000-0000-4000-8000-000000000001" }, error: null };
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => planRow),
                    })),
                  })),
                })),
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => planRow),
                })),
              })),
            })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: vi.fn(async () => ({ data: null, error: { message: "does not exist" } })),
    };
    mockCreateClient.mockReturnValue(mockSupabaseAdmin);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/onboarding", {
      method: "POST",
      body: JSON.stringify({
        business_name: "Mapped Studio",
        business_type: "both",
        address: {
          line1: "9 Category Way",
          city: "Cape Town",
          country: "ZA",
          latitude: -33.9249,
          longitude: 18.4241,
        },
        global_category_ids: ["11111111-1111-4111-8111-111111111111"],
        selected_zone_ids: [],
        operating_hours: {},
        services: [
          {
            title: "Signature Blowout",
            duration_minutes: 60,
            price: 350,
            currency: "ZAR",
            supports_at_home: true,
            supports_at_salon: true,
            category_id: "11111111-1111-4111-8111-111111111111",
            addons: [
              { name: "Hair Mask", price: 85, currency: "ZAR", duration_minutes: 10 },
            ],
          },
          {
            title: "Express Trim",
            duration_minutes: 30,
            price: 180,
            currency: "ZAR",
            supports_at_home: false,
            supports_at_salon: true,
          },
        ],
      }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.data?.provider?.id).toBe("provider-2");
    expect(providerCategoryInsertPayloads.length).toBe(1);
    expect(offeringsInsertPayloads[0]?.[0]?.provider_category_id).toBe("provider-category-1");
    expect(offeringsInsertPayloads[0]?.[0]?.category_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(offeringsInsertPayloads[0]?.[0]?.is_onboarding_auto_generated).toBe(false);
    expect(offeringsInsertPayloads[0]?.[1]?.provider_category_id).toBe("provider-category-1");
    expect(offeringsInsertPayloads[0]?.[1]?.category_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(offeringsInsertPayloads[0]?.[1]?.is_onboarding_auto_generated).toBe(false);
    expect(addonInsertPayloads[0]?.[0]?.name).toBe("Hair Mask");
    expect(addonInsertPayloads[0]?.[0]?.offering_id).toBe("offering-1");
  }, 45_000);
});

