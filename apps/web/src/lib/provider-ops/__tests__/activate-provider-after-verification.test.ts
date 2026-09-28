import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/tenant/scoped-overrides", () => ({
  fetchScopedSingle: vi.fn(),
}));

vi.mock("@/lib/provider-ops/mark-provider-onboarding-lifecycle-complete", () => ({
  markProviderOnboardingLifecycleComplete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendTemplateNotification: vi.fn().mockResolvedValue(undefined),
}));

import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { markProviderOnboardingLifecycleComplete } from "@/lib/provider-ops/mark-provider-onboarding-lifecycle-complete";
import { activateProviderAfterVerification } from "../activate-provider-after-verification";

describe("activateProviderAfterVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("promotes pending provider when auto-approve is on", async () => {
    vi.mocked(fetchScopedSingle).mockResolvedValue({
      data: { settings: { features: { auto_approve_providers: true } } },
      source: "tenant",
    } as never);

    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "providers") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "p1",
                    user_id: "u1",
                    tenant_id: "t1",
                    status: "pending_approval",
                    onboarding_state: "ready_for_activation",
                    business_name: "Salon",
                  },
                  error: null,
                }),
              }),
            }),
            update,
          };
        }
        throw new Error(table);
      }),
    };

    const result = await activateProviderAfterVerification(admin as never, {
      providerId: "p1",
      userId: "u1",
    });

    expect(result.activated).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", onboarding_state: "activated" }),
    );
    expect(markProviderOnboardingLifecycleComplete).toHaveBeenCalled();
  });

  it("does nothing when auto-approve is off", async () => {
    vi.mocked(fetchScopedSingle).mockResolvedValue({
      data: { settings: { features: { auto_approve_providers: false } } },
      source: "tenant",
    } as never);

    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "p1",
                user_id: "u1",
                tenant_id: "t1",
                status: "pending_approval",
                onboarding_state: "ready_for_activation",
              },
              error: null,
            }),
          }),
        }),
        update: vi.fn(),
      })),
    };

    const result = await activateProviderAfterVerification(admin as never, {
      providerId: "p1",
    });

    expect(result.activated).toBe(false);
    expect(result.reason).toBe("auto_approve_disabled");
    expect(markProviderOnboardingLifecycleComplete).not.toHaveBeenCalled();
  });

  it("does nothing for suspended providers", async () => {
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "p1",
                status: "suspended",
                onboarding_state: "ready_for_activation",
                tenant_id: "t1",
              },
              error: null,
            }),
          }),
        }),
      })),
    };

    const result = await activateProviderAfterVerification(admin as never, {
      providerId: "p1",
    });

    expect(result.activated).toBe(false);
    expect(result.reason).toBe("provider_not_eligible");
  });
});
