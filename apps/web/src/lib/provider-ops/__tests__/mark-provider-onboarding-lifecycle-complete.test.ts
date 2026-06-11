import { describe, expect, it, vi } from "vitest";
import { markProviderOnboardingLifecycleComplete } from "../mark-provider-onboarding-lifecycle-complete";

describe("markProviderOnboardingLifecycleComplete", () => {
  it("updates providers onboarding_state and tracking wizard_status", async () => {
    const providerUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const trackingUpsert = vi.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "providers") {
          return {
            update: providerUpdate,
          };
        }
        if (table === "provider_onboarding_tracking") {
          return {
            upsert: trackingUpsert,
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };

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
});
