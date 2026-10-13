import { shouldClearStoredReferralAfterAttach } from "@/lib/referral-attach-storage";

describe("shouldClearStoredReferralAfterAttach", () => {
  it("clears on success", () => {
    expect(shouldClearStoredReferralAfterAttach({ error: null, data: {} } as any)).toBe(true);
    expect(shouldClearStoredReferralAfterAttach({ error: undefined, data: {} } as any)).toBe(true);
  });

  it("clears on definitive client errors", () => {
    expect(shouldClearStoredReferralAfterAttach({ error: { status: 400 } } as any)).toBe(true);
    expect(shouldClearStoredReferralAfterAttach({ error: { status: 404 } } as any)).toBe(true);
  });

  it("keeps storage on transient errors", () => {
    expect(shouldClearStoredReferralAfterAttach({ error: { status: 503 } } as any)).toBe(false);
    expect(shouldClearStoredReferralAfterAttach({ error: { code: "NETWORK_ERROR" } } as any)).toBe(false);
    expect(shouldClearStoredReferralAfterAttach(null)).toBe(false);
  });
});
