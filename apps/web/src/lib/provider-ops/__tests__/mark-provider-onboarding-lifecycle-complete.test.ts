import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock next/cache before importing the module under test so revalidateTag
// calls are captured without a real Next.js runtime.
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

import { revalidateTag, revalidatePath } from "next/cache";
import { markProviderOnboardingLifecycleComplete } from "../mark-provider-onboarding-lifecycle-complete";

function buildSupabaseMock() {
  const providerUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const trackingUpsert = vi.fn().mockResolvedValue({ error: null });

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "providers") return { update: providerUpdate };
      if (table === "provider_onboarding_tracking") return { upsert: trackingUpsert };
      throw new Error(`unexpected table ${table}`);
    }),
  };

  return { supabase, providerUpdate, trackingUpsert };
}

describe("markProviderOnboardingLifecycleComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates providers onboarding_state and tracking wizard_status", async () => {
    const { supabase, providerUpdate, trackingUpsert } = buildSupabaseMock();

    await markProviderOnboardingLifecycleComplete(supabase as never, {
      providerId: "prov-1",
      userId: "user-1",
      tenantId: "tenant-1",
    });

    expect(providerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding_state: "activated" }),
    );
    expect(trackingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        provider_id: "prov-1",
        wizard_status: "completed",
      }),
      { onConflict: "user_id" },
    );
  });

  it("busts the public discovery feed cache with global and per-tenant tags on activation", async () => {
    const { supabase } = buildSupabaseMock();

    await markProviderOnboardingLifecycleComplete(supabase as never, {
      providerId: "prov-42",
      userId: "user-42",
      tenantId: "tenant-abc",
    });

    expect(revalidateTag).toHaveBeenCalledWith("public-providers", "default");
    expect(revalidateTag).toHaveBeenCalledWith("public-home", "default");
    expect(revalidateTag).toHaveBeenCalledWith("public-providers-tenant-abc", "default");
    expect(revalidateTag).toHaveBeenCalledWith("public-home-tenant-abc", "default");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("still busts global tags when tenantId is null", async () => {
    const { supabase } = buildSupabaseMock();

    await markProviderOnboardingLifecycleComplete(supabase as never, {
      providerId: "prov-99",
      userId: "user-99",
      tenantId: null,
    });

    expect(revalidateTag).toHaveBeenCalledWith("public-providers", "default");
    expect(revalidateTag).toHaveBeenCalledWith("public-home", "default");
    // Per-tenant tags must NOT be emitted when tenantId is absent
    const tagCalls = vi.mocked(revalidateTag).mock.calls.map((c) => c[0]);
    expect(tagCalls.some((t) => t.includes("null"))).toBe(false);
  });
});
