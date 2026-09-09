import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkExpressBookingFeatureAccess } from "../feature-access";

function mockSupabaseWithPlanFeatures(features: Record<string, unknown>): SupabaseClient {
  const subscriptionResult = {
    data: {
      status: "active",
      plan: {
        id: "plan-1",
        name: "Test",
        features,
        is_free: false,
      },
    },
    error: null,
  };

  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(subscriptionResult),
  };

  return {
    from: vi.fn().mockReturnValue(chain),
    rpc: vi.fn().mockResolvedValue({ data: null }),
  } as unknown as SupabaseClient;
}

describe("checkExpressBookingFeatureAccess", () => {
  it("fail-opens when express_booking key is missing", async () => {
    const supabase = mockSupabaseWithPlanFeatures({});
    const access = await checkExpressBookingFeatureAccess("provider-1", supabase);
    expect(access.enabled).toBe(true);
  });

  it("denies when enabled is explicitly false", async () => {
    const supabase = mockSupabaseWithPlanFeatures({
      express_booking: { enabled: false, max_links: 5 },
    });
    const access = await checkExpressBookingFeatureAccess("provider-1", supabase);
    expect(access.enabled).toBe(false);
    expect(access.maxLinks).toBe(5);
  });

  it("honors max_links when enabled is true", async () => {
    const supabase = mockSupabaseWithPlanFeatures({
      express_booking: { enabled: true, max_links: 5 },
    });
    const access = await checkExpressBookingFeatureAccess("provider-1", supabase);
    expect(access.enabled).toBe(true);
    expect(access.maxLinks).toBe(5);
  });
});
