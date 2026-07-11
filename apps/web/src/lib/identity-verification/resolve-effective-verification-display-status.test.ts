import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetVerificationStatus = vi.fn();

vi.mock("./identity-verification-service", () => ({
  getVerificationStatus: (...args: unknown[]) => mockGetVerificationStatus(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { identity_verified: true, identity_verification_status: "approved" },
                }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

describe("resolveEffectiveVerificationDisplayStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns approved when legacy identity_verified is true but no Didit session", async () => {
    mockGetVerificationStatus.mockResolvedValue("not_started");

    const { resolveEffectiveVerificationDisplayStatus } = await import(
      "./resolve-effective-verification-display-status"
    );
    const status = await resolveEffectiveVerificationDisplayStatus("user-1", "customer");

    expect(status).toBe("approved");
  });

  it("prefers session status when session is approved", async () => {
    mockGetVerificationStatus.mockResolvedValue("approved");

    const { resolveEffectiveVerificationDisplayStatus } = await import(
      "./resolve-effective-verification-display-status"
    );
    const status = await resolveEffectiveVerificationDisplayStatus("user-1", "customer");

    expect(status).toBe("approved");
    expect(mockGetVerificationStatus).toHaveBeenCalledWith("user-1", "customer", undefined, "user");
  });
});
