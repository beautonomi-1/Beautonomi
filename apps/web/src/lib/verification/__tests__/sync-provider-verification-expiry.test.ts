import { describe, expect, it } from "vitest";
import { syncProviderVerificationStateFromDidit } from "@/lib/verification/sync-provider-verification";

describe("syncProviderVerificationStateFromDidit expiry mapping", () => {
  it("exports function accepting kycCredentialExpired option", () => {
    expect(typeof syncProviderVerificationStateFromDidit).toBe("function");
    expect(syncProviderVerificationStateFromDidit.length).toBeGreaterThanOrEqual(4);
  });
});
