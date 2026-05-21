import { describe, it, expect, vi } from "vitest";
import {
  getEffectiveSkipPayoutAccountVerification,
  showVerifyAccountButton,
} from "@/lib/payments/payout-account-verification-settings";

describe("payout-account-verification-settings", () => {
  it("showVerifyAccountButton is inverse of skip", () => {
    expect(showVerifyAccountButton(true)).toBe(false);
    expect(showVerifyAccountButton(false)).toBe(true);
  });

  it("returns tenant skip when tenant row sets true", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: { settings: { paystack: { skip_payout_account_verification: true } } },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    };

    const r = await getEffectiveSkipPayoutAccountVerification(supabase as never, "tenant-a");
    expect(r.skip).toBe(true);
    expect(r.source).toBe("tenant");
  });

  it("falls back to global when tenant has no override", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: { settings: {} }, error: null })
      .mockResolvedValueOnce({
        data: { settings: { paystack: { skip_payout_account_verification: true } } },
        error: null,
      });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle,
      }),
    };

    const r = await getEffectiveSkipPayoutAccountVerification(supabase as never, "tenant-a");
    expect(r.skip).toBe(true);
    expect(r.source).toBe("global");
  });
});
