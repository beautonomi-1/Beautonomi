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

/** Required by onboardingSchema since provider card images became mandatory. */
const onboardingProfileImages = {
  thumbnail_url: "https://example.com/thumbnail.jpg",
  avatar_url: "https://example.com/avatar.jpg",
};

/**
 * Supabase Storage bucket mock used by every test in this suite.
 *
 * The route calls:
 *   const { data: uploadData, error } = await supabaseAdmin.storage.from(bucket).upload(path, blob)
 *   const { data: { publicUrl } } = supabaseAdmin.storage.from(bucket).getPublicUrl(uploadData.path)
 *
 * Both methods must return the correct shape or destructuring will throw.
 */
function makeStorageMock() {
  return {
    from: vi.fn((bucket: string) => ({
      upload: vi.fn(async (path: string) => ({
        data: { path: `${bucket}/${path}` },
        error: null,
      })),
      getPublicUrl: vi.fn((path: string) => ({
        data: { publicUrl: `https://storage.example.com/${bucket}/${path}` },
      })),
    })),
  };
}

/** Handles provider_subscriptions + subscription_plans queries from buildOnboardingCompletionResponse. */
function makeSubscriptionCompletionMocks(options?: {
  hasActiveSubscription?: boolean;
  isPaidSubscription?: boolean;
  onSubscriptionInsert?: (payload: Record<string, unknown>) => void;
  linkedPlanId?: string;
}) {
  const hasSub = options?.hasActiveSubscription ?? false;
  const isPaid = options?.isPaidSubscription ?? false;
  const linkedPlanId = options?.linkedPlanId ?? "00000000-0000-4000-8000-000000000001";
  const paidPlanId = "paid-sub-plan-id";

  const activeSubRow = hasSub
    ? {
        id: "sub-active",
        status: "active",
        plan_id: isPaid ? paidPlanId : linkedPlanId,
      }
    : null;

  let insertedSubscription = false;

  const providerSubscriptions = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: activeSubRow || insertedSubscription
              ? {
                  id: activeSubRow?.id ?? "sub-inserted",
                  status: "active",
                  plan_id: activeSubRow?.plan_id ?? linkedPlanId,
                }
              : null,
            error: null,
          })),
        })),
        maybeSingle: vi.fn(async () => ({
          data: activeSubRow || insertedSubscription
            ? { id: activeSubRow?.id ?? "sub-inserted", plan_id: activeSubRow?.plan_id ?? linkedPlanId }
            : null,
          error: null,
        })),
      })),
    })),
    insert: vi.fn(async (payload: Record<string, unknown>) => {
      insertedSubscription = true;
      options?.onSubscriptionInsert?.(payload);
      return { error: null };
    }),
  };

  const subscriptionPlans = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: linkedPlanId, is_free: true, is_active: true },
                error: null,
              })),
            })),
          })),
          maybeSingle: vi.fn(async () => ({
            data: { id: linkedPlanId, is_free: true, is_active: true },
            error: null,
          })),
        })),
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { id: linkedPlanId, is_free: true, is_active: true },
              error: null,
            })),
          })),
        })),
        limit: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: { id: linkedPlanId, is_free: true, is_active: true },
            error: null,
          })),
        })),
        maybeSingle: vi.fn(async () => ({
          data: {
            id: isPaid ? paidPlanId : linkedPlanId,
            is_free: !isPaid,
            is_active: true,
          },
          error: null,
        })),
      })),
    })),
  };

  return { providerSubscriptions, subscriptionPlans };
}

const defaultSubscriptionMocks = makeSubscriptionCompletionMocks();

describe("POST /api/provider/onboarding", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates provider with tenant_id and tenant-scoped travel currency defaults", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-1", role: "customer" },
    });
    mockGetSupabaseServer.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
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
      storage: makeStorageMock(),
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
          return defaultSubscriptionMocks.providerSubscriptions;
        }

        if (table === "subscription_plans") {
          return defaultSubscriptionMocks.subscriptionPlans;
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

        if (table === "provider_staff") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
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
        ...onboardingProfileImages,
      }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.data?.provider?.id).toBe("provider-1");

    expect(providersInsertPayloads[0]?.tenant_id).toBe("tenant-uk");
    expect(zoneSelectionInsertPayloads[0]?.[0]?.currency).toBe("GBP");
  }, 120_000);

  it("maps onboarding global categories to provider categories and persists addons", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-2", role: "customer" },
    });
    mockGetSupabaseServer.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
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
    const providerCategoryInsertPayloads: Array<Record<string, unknown>> = [];

    const mockSupabaseAdmin = {
      storage: makeStorageMock(),
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
          return defaultSubscriptionMocks.providerSubscriptions;
        }

        if (table === "subscription_plans") {
          return defaultSubscriptionMocks.subscriptionPlans;
        }

        if (table === "provider_staff") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
            insert: vi.fn(async () => ({ error: null })),
          };
        }

        if (table === "provider_travel_fee_settings") {
          return {
            upsert: vi.fn(async () => ({ error: null })),
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
        ...onboardingProfileImages,
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
    expect(offeringsInsertPayloads.length).toBe(2);
    expect(offeringsInsertPayloads[1]?.[0]?.title).toBe("Hair Mask");
    expect(offeringsInsertPayloads[1]?.[0]?.service_type).toBe("addon");
    expect(offeringsInsertPayloads[1]?.[0]?.applicable_service_ids).toEqual(["offering-1"]);
  }, 120_000);

  it("returns requires_checkout=true and a checkout_path when a paid pricing plan is selected", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-paid", role: "customer" },
    });
    mockGetSupabaseServer.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");

    const paidPlanId = "33333333-3333-4333-8333-333333333333";

    // fetchScopedSingle is called twice: once for tenant settings, then for
    // the selected pricing_plans row. Return tenant settings first, then a
    // paid plan row with a paystack code.
    mockFetchScopedSingle
      .mockResolvedValueOnce({
        data: {
          settings: { features: { auto_approve_providers: true } },
        },
        source: "tenant",
      })
      .mockResolvedValueOnce({
        data: {
          id: paidPlanId,
          price: "R 499",
          paystack_plan_code_monthly: "PLN_xxxxx",
          paystack_plan_code_yearly: null,
          subscription_plan_id: "linked-sub-plan-uuid",
        },
        source: "tenant",
      });

    const mockSupabaseAdmin = {
      storage: makeStorageMock(),
      from: vi.fn((table: string) => {
        if (table === "providers") {
          let insertPayload: Record<string, unknown> | null = null;
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
            insert: vi.fn((payload: Record<string, unknown>) => {
              insertPayload = payload;
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: "provider-paid", ...insertPayload },
                    error: null,
                  })),
                })),
              };
            }),
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
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
          return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) };
        }
        if (table === "provider_locations") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "loc-paid" }, error: null })),
              })),
            })),
          };
        }
        if (table === "provider_global_category_associations") {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        if (table === "global_categories") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({ data: [], error: null })),
            })),
          };
        }
        if (table === "provider_zone_selections") {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        if (table === "provider_onboarding_drafts") {
          return { delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) };
        }
        if (table === "provider_onboarding_tracking") {
          return {
            upsert: vi.fn(async () => ({ error: null })),
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
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
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
          };
        }
        if (table === "provider_lead_activities") {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        if (table === "provider_subscriptions") {
          return defaultSubscriptionMocks.providerSubscriptions;
        }
        if (table === "subscription_plans") {
          return defaultSubscriptionMocks.subscriptionPlans;
        }
        if (table === "provider_staff") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
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
        business_name: "Paid Studio",
        business_type: "salon",
        address: {
          line1: "1 Pay Street",
          city: "Cape Town",
          country: "ZA",
          latitude: -33.92,
          longitude: 18.42,
        },
        global_category_ids: ["11111111-1111-4111-8111-111111111111"],
        selected_zone_ids: [],
        operating_hours: {},
        services: [],
        selected_plan_id: paidPlanId,
        ...onboardingProfileImages,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.data?.selected_plan_id).toBe(paidPlanId);
    expect(json?.data?.selected_plan_is_free).toBe(false);
    expect(json?.data?.requires_checkout).toBe(true);
    expect(json?.data?.checkout_path).toBe(
      `/provider/subscription-checkout?planId=${paidPlanId}`,
    );
    // Metadata for clients that infer checkout from subscription_endpoint presence.
    expect(json?.data?.subscription_endpoint).toBe("/api/provider/subscription/initialize-payment");
  }, 120_000);

  it("returns requires_checkout=false for a free pricing plan and seeds the linked subscription plan", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-free", role: "customer" },
    });
    mockGetSupabaseServer.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");

    const freePlanId = "44444444-4444-4444-8444-444444444444";
    const linkedSubscriptionPlanId = "55555555-5555-4555-8555-555555555555";

    mockFetchScopedSingle
      .mockResolvedValueOnce({
        data: {
          settings: { features: { auto_approve_providers: true } },
        },
        source: "tenant",
      })
      .mockResolvedValueOnce({
        data: {
          id: freePlanId,
          price: "Free",
          paystack_plan_code_monthly: null,
          paystack_plan_code_yearly: null,
          subscription_plan_id: linkedSubscriptionPlanId,
        },
        source: "tenant",
      });

    const subscriptionInserts: Array<Record<string, unknown>> = [];
    const freePlanSubMocks = makeSubscriptionCompletionMocks({
      linkedPlanId: linkedSubscriptionPlanId,
      onSubscriptionInsert: (payload) => subscriptionInserts.push(payload),
    });

    const mockSupabaseAdmin = {
      storage: makeStorageMock(),
      from: vi.fn((table: string) => {
        if (table === "providers") {
          let insertPayload: Record<string, unknown> | null = null;
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
            insert: vi.fn((payload: Record<string, unknown>) => {
              insertPayload = payload;
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: "provider-free", ...insertPayload },
                    error: null,
                  })),
                })),
              };
            }),
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
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
          return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) };
        }
        if (table === "provider_locations") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "loc-free" }, error: null })),
              })),
            })),
          };
        }
        if (table === "provider_global_category_associations") {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        if (table === "global_categories") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({ data: [], error: null })),
            })),
          };
        }
        if (table === "provider_zone_selections") {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        if (table === "provider_onboarding_drafts") {
          return { delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) };
        }
        if (table === "provider_onboarding_tracking") {
          return {
            upsert: vi.fn(async () => ({ error: null })),
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
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
            update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
          };
        }
        if (table === "provider_lead_activities") {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        if (table === "provider_subscriptions") {
          return freePlanSubMocks.providerSubscriptions;
        }
        if (table === "subscription_plans") {
          return freePlanSubMocks.subscriptionPlans;
        }
        if (table === "provider_staff") {
          // Salon owner staff creation (migration 618 RPC fallback path)
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
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
        business_name: "Free Studio",
        business_type: "salon",
        address: {
          line1: "1 Free Avenue",
          city: "Johannesburg",
          country: "ZA",
          latitude: -26.2,
          longitude: 28.04,
        },
        global_category_ids: ["11111111-1111-4111-8111-111111111111"],
        selected_zone_ids: [],
        operating_hours: {},
        services: [],
        selected_plan_id: freePlanId,
        ...onboardingProfileImages,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.data?.selected_plan_id).toBe(freePlanId);
    expect(json?.data?.selected_plan_is_free).toBe(true);
    expect(json?.data?.requires_checkout).toBe(false);
    expect(json?.data?.checkout_path).toBeNull();
    expect(json?.data?.subscription_endpoint).toBeNull();
    expect(json?.data?.selected_subscription_plan_id).toBe(linkedSubscriptionPlanId);

    // The free subscription row should use the linked subscription_plans id,
    // not a generic catalog fallback.
    expect(subscriptionInserts).toHaveLength(1);
    expect(subscriptionInserts[0]?.plan_id).toBe(linkedSubscriptionPlanId);
  }, 120_000);

  it("returns 200 idempotently when provider already exists with a free plan and seeds subscription if missing", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-idempotent-free", role: "customer" },
    });
    mockGetSupabaseServer.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");

    const freePlanId = "44444444-4444-4444-8444-444444444444";
    const linkedSubscriptionPlanId = "55555555-5555-4555-8555-555555555555";
    const existingProviderId = "provider-existing-free";

    mockFetchScopedSingle.mockResolvedValue({
      data: {
        id: freePlanId,
        price: "Free",
        paystack_plan_code_monthly: null,
        paystack_plan_code_yearly: null,
        subscription_plan_id: linkedSubscriptionPlanId,
      },
      source: "tenant",
    });

    const subscriptionInserts: Array<Record<string, unknown>> = [];
    const idempotentFreeSubMocks = makeSubscriptionCompletionMocks({
      linkedPlanId: linkedSubscriptionPlanId,
      onSubscriptionInsert: (payload) => subscriptionInserts.push(payload),
    });

    const mockSupabaseAdmin = {
      storage: makeStorageMock(),
      from: vi.fn((table: string) => {
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string) => {
                if (col === "user_id") {
                  return {
                    maybeSingle: vi.fn(async () => ({
                      data: { id: existingProviderId },
                      error: null,
                    })),
                  };
                }
                return {
                  single: vi.fn(async () => ({
                    data: {
                      id: existingProviderId,
                      status: "active",
                      business_name: "Existing Free Studio",
                    },
                    error: null,
                  })),
                };
              }),
            })),
          };
        }
        if (table === "provider_subscriptions") {
          return idempotentFreeSubMocks.providerSubscriptions;
        }
        if (table === "subscription_plans") {
          return idempotentFreeSubMocks.subscriptionPlans;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: vi.fn(async () => ({ data: "tenant-za", error: null })),
    };
    mockCreateClient.mockReturnValue(mockSupabaseAdmin);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/onboarding", {
      method: "POST",
      body: JSON.stringify({
        business_name: "Existing Free Studio",
        business_type: "salon",
        address: {
          line1: "1 Free Avenue",
          city: "Johannesburg",
          country: "ZA",
        },
        global_category_ids: ["11111111-1111-4111-8111-111111111111"],
        operating_hours: {},
        services: [],
        selected_plan_id: freePlanId,
        ...onboardingProfileImages,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.data?.already_completed).toBe(true);
    expect(json?.data?.requires_checkout).toBe(false);
    expect(json?.data?.selected_plan_is_free).toBe(true);
    expect(json?.data?.subscription_active).toBe(true);
    expect(subscriptionInserts.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 200 idempotently for paid plan when no subscription yet (requires checkout)", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-idempotent-paid", role: "customer" },
    });
    mockGetSupabaseServer.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");

    const paidPlanId = "33333333-3333-4333-8333-333333333333";
    const existingProviderId = "provider-existing-paid";

    mockFetchScopedSingle.mockResolvedValue({
      data: {
        id: paidPlanId,
        price: "R 499",
        paystack_plan_code_monthly: "PLN_xxxxx",
        paystack_plan_code_yearly: null,
        subscription_plan_id: "linked-sub-plan-uuid",
      },
      source: "tenant",
    });

    const paidPendingSubMocks = makeSubscriptionCompletionMocks();

    const mockSupabaseAdmin = {
      storage: makeStorageMock(),
      from: vi.fn((table: string) => {
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string) => {
                if (col === "user_id") {
                  return {
                    maybeSingle: vi.fn(async () => ({
                      data: { id: existingProviderId },
                      error: null,
                    })),
                  };
                }
                return {
                  single: vi.fn(async () => ({
                    data: { id: existingProviderId, status: "pending_approval" },
                    error: null,
                  })),
                };
              }),
            })),
          };
        }
        if (table === "provider_subscriptions") {
          return paidPendingSubMocks.providerSubscriptions;
        }
        if (table === "subscription_plans") {
          return paidPendingSubMocks.subscriptionPlans;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    };
    mockCreateClient.mockReturnValue(mockSupabaseAdmin);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/onboarding", {
      method: "POST",
      body: JSON.stringify({
        business_name: "Paid Studio",
        business_type: "salon",
        address: { line1: "1 Pay Street", city: "Cape Town", country: "ZA" },
        global_category_ids: ["11111111-1111-4111-8111-111111111111"],
        operating_hours: {},
        services: [],
        selected_plan_id: paidPlanId,
        ...onboardingProfileImages,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.data?.already_completed).toBe(true);
    expect(json?.data?.requires_checkout).toBe(true);
    expect(json?.data?.checkout_path).toContain(paidPlanId);
  });

  it("returns 200 idempotently for paid plan when active paid subscription exists (no checkout)", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-idempotent-paid-done", role: "provider_owner" },
    });
    mockGetSupabaseServer.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");

    const paidPlanId = "33333333-3333-4333-8333-333333333333";
    const existingProviderId = "provider-existing-paid-done";

    mockFetchScopedSingle.mockResolvedValue({
      data: {
        id: paidPlanId,
        price: "R 499",
        paystack_plan_code_monthly: "PLN_xxxxx",
        paystack_plan_code_yearly: null,
        subscription_plan_id: "linked-sub-plan-uuid",
      },
      source: "tenant",
    });

    const paidDoneSubMocks = makeSubscriptionCompletionMocks({
      hasActiveSubscription: true,
      isPaidSubscription: true,
    });

    const mockSupabaseAdmin = {
      storage: makeStorageMock(),
      from: vi.fn((table: string) => {
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string) => {
                if (col === "user_id") {
                  return {
                    maybeSingle: vi.fn(async () => ({
                      data: { id: existingProviderId },
                      error: null,
                    })),
                  };
                }
                return {
                  single: vi.fn(async () => ({
                    data: { id: existingProviderId, status: "active" },
                    error: null,
                  })),
                };
              }),
            })),
          };
        }
        if (table === "provider_subscriptions") {
          return paidDoneSubMocks.providerSubscriptions;
        }
        if (table === "subscription_plans") {
          return paidDoneSubMocks.subscriptionPlans;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    };
    mockCreateClient.mockReturnValue(mockSupabaseAdmin);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/onboarding", {
      method: "POST",
      body: JSON.stringify({
        business_name: "Paid Studio Done",
        business_type: "salon",
        address: { line1: "1 Pay Street", city: "Cape Town", country: "ZA" },
        global_category_ids: ["11111111-1111-4111-8111-111111111111"],
        operating_hours: {},
        services: [],
        selected_plan_id: paidPlanId,
        ...onboardingProfileImages,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.data?.already_completed).toBe(true);
    expect(json?.data?.requires_checkout).toBe(false);
    expect(json?.data?.subscription_active).toBe(true);
  });

  it("persists tiered travel fees for mobile providers", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-travel-tiered", role: "customer" },
    });
    mockGetSupabaseServer.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockFetchScopedSingle.mockResolvedValue({
      data: {
        settings: {
          features: { auto_approve_providers: true },
          travel_fees: {
            default_rate_per_km: 8,
            default_minimum_fee: 20,
            default_currency: "ZAR",
            allow_provider_customization: true,
            allow_provider_tiered: true,
          },
        },
      },
      source: "tenant",
    });

    const travelFeeUpsertPayloads: Array<Record<string, unknown>> = [];

    const mockSupabaseAdmin = {
      storage: makeStorageMock(),
      from: vi.fn((table: string) => {
        if (table === "providers") {
          let insertPayload: Record<string, unknown> | null = null;
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
            insert: vi.fn((payload: Record<string, unknown>) => {
              insertPayload = payload;
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: "provider-travel", ...insertPayload },
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
                single: vi.fn(async () => ({ data: { id: "loc-1" }, error: null })),
              })),
            })),
          };
        }
        if (table === "provider_global_category_associations") {
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        if (table === "global_categories") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({ data: [], error: null })),
            })),
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
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        if (table === "provider_subscriptions") {
          return defaultSubscriptionMocks.providerSubscriptions;
        }
        if (table === "subscription_plans") {
          return defaultSubscriptionMocks.subscriptionPlans;
        }
        if (table === "offerings") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [], error: null })),
            })),
          };
        }
        if (table === "provider_travel_fee_settings") {
          return {
            upsert: vi.fn(async (payload: Record<string, unknown>) => {
              travelFeeUpsertPayloads.push(payload);
              return { error: null };
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: vi.fn(async () => ({ data: null, error: { message: "does not exist" } })),
    };
    mockCreateClient.mockReturnValue(mockSupabaseAdmin);

    const tiers = [
      { max_km: 5, fee: 50 },
      { max_km: 15, fee: 120 },
      { max_km: 30, fee: 200 },
    ];

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/onboarding", {
      method: "POST",
      body: JSON.stringify({
        business_name: "Mobile Cuts",
        business_type: "mobile",
        address: {
          line1: "10 Travel Lane",
          city: "Cape Town",
          country: "ZA",
          latitude: -33.9249,
          longitude: 18.4241,
        },
        global_category_ids: ["11111111-1111-4111-8111-111111111111"],
        operating_hours: {},
        services: [],
        travel_fees: {
          enabled: true,
          use_platform_default: false,
          pricing_model: "tiered",
          tiers,
        },
        ...onboardingProfileImages,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.data?.provider?.id).toBe("provider-travel");
    expect(travelFeeUpsertPayloads.length).toBe(1);
    expect(travelFeeUpsertPayloads[0]?.pricing_model).toBe("tiered");
    expect(travelFeeUpsertPayloads[0]?.use_platform_default).toBe(false);
    expect(travelFeeUpsertPayloads[0]?.tiers).toEqual(tiers);
  }, 120_000);

  it("auto-generates bookable services with provider category names when services array is empty", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-autogen", role: "customer" },
    });
    mockGetSupabaseServer.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockFetchScopedSingle.mockResolvedValue({
      data: {
        settings: { features: { auto_approve_providers: true } },
      },
      source: "tenant",
    });

    const offeringsInsertPayloads: Array<Array<Record<string, unknown>>> = [];

    const mockSupabaseAdmin = {
      storage: makeStorageMock(),
      from: vi.fn((table: string) => {
        if (table === "providers") {
          let insertPayload: Record<string, unknown> | null = null;
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
            insert: vi.fn((payload: Record<string, unknown>) => {
              insertPayload = payload;
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: "provider-autogen", ...insertPayload },
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
                single: vi.fn(async () => ({ data: { id: "loc-1" }, error: null })),
              })),
            })),
          };
        }
        if (table === "provider_global_category_associations") {
          return { insert: vi.fn(async () => ({ error: null })) };
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
              eq: vi.fn((column: string) => {
                if (column === "provider_id") {
                  return {
                    in: vi.fn(async () => ({ data: [], error: null })),
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({ data: { display_order: 0 }, error: null })),
                      })),
                    })),
                    eq: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                    })),
                  };
                }
                return {
                  in: vi.fn(async () => ({ data: [], error: null })),
                };
              }),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: "provider-category-hair", slug: "hair" },
                  error: null,
                })),
              })),
            })),
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
          return { insert: vi.fn(async () => ({ error: null })) };
        }
        if (table === "provider_subscriptions") {
          return defaultSubscriptionMocks.providerSubscriptions;
        }
        if (table === "subscription_plans") {
          return defaultSubscriptionMocks.subscriptionPlans;
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
        if (table === "provider_travel_fee_settings") {
          return { upsert: vi.fn(async () => ({ error: null })) };
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
        business_name: "Auto Gen Salon",
        business_type: "salon",
        address: {
          line1: "1 Hair Street",
          city: "Cape Town",
          country: "ZA",
          latitude: -33.9249,
          longitude: 18.4241,
        },
        global_category_ids: ["11111111-1111-4111-8111-111111111111"],
        operating_hours: {},
        services: [],
        ...onboardingProfileImages,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.data?.provider?.id).toBe("provider-autogen");
    expect(offeringsInsertPayloads.length).toBeGreaterThan(0);
    const firstBatch = offeringsInsertPayloads[0] ?? [];
    expect(firstBatch.length).toBeGreaterThan(0);
    for (const row of firstBatch) {
      expect(row.is_bookable).toBe(true);
      expect(row.is_onboarding_auto_generated).toBe(true);
      expect(row.provider_category_id).toBeTruthy();
    }
    expect(firstBatch.some((row) => row.title === "Haircut")).toBe(true);
  }, 120_000);
});

