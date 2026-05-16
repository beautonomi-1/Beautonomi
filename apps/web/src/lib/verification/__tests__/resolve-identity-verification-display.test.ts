import { describe, expect, it } from "vitest";
import { resolveIdentityVerificationDisplay } from "../resolve-identity-verification-display";

describe("resolveIdentityVerificationDisplay", () => {
  it("allows re-submission after admin reset even when latest row is approved", () => {
    const result = resolveIdentityVerificationDisplay(
      { identity_verified: false, identity_verification_status: "none" },
      {
        id: "v1",
        status: "approved",
        submitted_at: "2026-01-01T00:00:00Z",
        document_url: "https://example.com/doc.pdf",
        document_type: "passport",
      },
    );

    expect(result.identity_verified).toBe(false);
    expect(result.identity_verification_status).toBe("none");
    expect(result.can_submit_verification).toBe(true);
    expect(result.identity_verification_document_url).toBeNull();
  });

  it("blocks submission while review is in flight", () => {
    const result = resolveIdentityVerificationDisplay(
      { identity_verified: false, identity_verification_status: "pending" },
      { id: "v2", status: "pending", submitted_at: "2026-02-01T00:00:00Z", document_url: "x" },
    );

    expect(result.can_submit_verification).toBe(false);
    expect(result.identity_verification_document_url).toBe("x");
  });
});
