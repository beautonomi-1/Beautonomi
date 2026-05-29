/**
 * Public hold preflight uses provider-portal policy (min-notice=0, max-advance=365).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mockEvaluate = vi.fn();

vi.mock("@/lib/provider-booking/compute-provider-slot-grid", () => ({
  evaluateProviderSlotAgainstGrid: (...args: unknown[]) => mockEvaluate(...args),
}));

describe("assertPublicSlotBookable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvaluate.mockResolvedValue({
      ok: true,
      conflicts: [],
      providerTimeZone: "Africa/Johannesburg",
    });
  });

  it("delegates to evaluateProviderSlotAgainstGrid with min-notice=0 and max-advance=365", async () => {
    const { assertPublicSlotBookable } = await import("../assert-public-slot-bookable");
    const supabase = {} as SupabaseClient;
    const scheduledAt = new Date("2026-06-10T07:00:00.000Z");

    const result = await assertPublicSlotBookable(supabase, {
      providerId: "provider-1",
      scheduledAt,
      durationMinutes: 60,
      staffIdsCsv: "staff-a",
      locationId: "loc-1",
      mode: "salon",
      travelBufferRaw: "0",
      resourceOfferingIds: ["offering-1"],
    });

    expect(result.ok).toBe(true);
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
    const [, input] = mockEvaluate.mock.calls[0] as [SupabaseClient, Record<string, unknown>];
    expect(input.minNoticeMinutes).toBe(0);
    expect(input.maxAdvanceDays).toBe(365);
    expect(input.providerId).toBe("provider-1");
    expect(input.scheduledAt).toBe(scheduledAt);
  });
});
