/**
 * Unit tests for the verification policy resolver.
 *
 * The resolver depends on:
 *   - checkMultipleFeaturesServer (feature-flags.ts)
 *   - resolveSumsubConfig (sumsub-token.ts)
 *   - getSupabaseAdmin (supabase/admin.ts)
 *
 * All three are mocked so we can test the derivation logic in isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks must be hoisted before imports ──────────────────────────────────────
vi.mock("@/lib/server/feature-flags", () => ({
  checkMultipleFeaturesServer: vi.fn(),
}));

vi.mock("@/lib/verification/sumsub-token", () => ({
  resolveSumsubConfig: vi.fn(),
}));

// isProviderVerificationApproved also calls getSupabaseAdmin — stub it out
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  })),
}));

import { checkMultipleFeaturesServer } from "@/lib/server/feature-flags";
import { resolveSumsubConfig } from "@/lib/verification/sumsub-token";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  resolveVerificationPolicy,
  isProviderVerificationApproved,
  isCustomerVerificationApproved,
  type VerificationMode,
} from "@/lib/verification/verification-policy";

const mockFlags = checkMultipleFeaturesServer as ReturnType<typeof vi.fn>;
const mockSumsub = resolveSumsubConfig as ReturnType<typeof vi.fn>;
const mockAdmin = getSupabaseAdmin as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── resolveVerificationPolicy ─────────────────────────────────────────────────

describe("resolveVerificationPolicy — mode derivation", () => {
  const creds = { app_token_secret: "tok", secret_key_secret: "sec" };

  async function policy(
    flags: Record<string, boolean>,
    sumsubConfig: Record<string, unknown> | null = creds,
  ) {
    mockFlags.mockResolvedValue(flags);
    mockSumsub.mockResolvedValue(sumsubConfig);
    return resolveVerificationPolicy(null);
  }

  it('returns mode=both when sumsub flag+creds on AND manual on', async () => {
    const p = await policy({
      "verification.sumsub.enabled": true,
      "verification.manual.enabled": true,
    });
    expect(p.mode).toBe<VerificationMode>("both");
    expect(p.sumsubEnabled).toBe(true);
    expect(p.manualEnabled).toBe(true);
  });

  it('returns mode=sumsub when only sumsub is on', async () => {
    const p = await policy({
      "verification.sumsub.enabled": true,
      "verification.manual.enabled": false,
    });
    expect(p.mode).toBe<VerificationMode>("sumsub");
  });

  it('returns mode=manual when only manual is on', async () => {
    const p = await policy({
      "verification.sumsub.enabled": false,
      "verification.manual.enabled": true,
    });
    expect(p.mode).toBe<VerificationMode>("manual");
  });

  it('returns mode=off when both flags are off', async () => {
    const p = await policy({
      "verification.sumsub.enabled": false,
      "verification.manual.enabled": false,
    });
    expect(p.mode).toBe<VerificationMode>("off");
    expect(p.sumsubEnabled).toBe(false);
    expect(p.manualEnabled).toBe(false);
  });

  it('disables sumsub when flag is on but credentials are absent', async () => {
    const p = await policy(
      { "verification.sumsub.enabled": true, "verification.manual.enabled": true },
      { app_token_secret: null, secret_key_secret: null }, // no creds
    );
    expect(p.sumsubEnabled).toBe(false);
    expect(p.mode).toBe<VerificationMode>("manual");
  });

  it('disables sumsub when sumsub config row is null', async () => {
    const p = await policy(
      { "verification.sumsub.enabled": true, "verification.manual.enabled": true },
      null,
    );
    expect(p.sumsubEnabled).toBe(false);
  });

  it('reads requiredForProviders and requiredForPayouts from flags', async () => {
    const p = await policy({
      "verification.sumsub.enabled": false,
      "verification.manual.enabled": true,
      provider_verification: true,
      "verification.sumsub.required_for_payouts": true,
    });
    expect(p.requiredForProviders).toBe(true);
    expect(p.requiredForPayouts).toBe(true);
  });

  it('reads requiredForCustomers from flags', async () => {
    const p = await policy({
      "verification.sumsub.enabled": false,
      "verification.manual.enabled": true,
      "verification.required_for_customers": true,
    });
    expect(p.requiredForCustomers).toBe(true);
  });

  it('defaults requiredForProviders and requiredForPayouts to false when flags absent', async () => {
    const p = await policy({ "verification.manual.enabled": true });
    expect(p.requiredForProviders).toBe(false);
    expect(p.requiredForPayouts).toBe(false);
  });

  it('defaults requiredForCustomers to false when flag absent', async () => {
    const p = await policy({ "verification.manual.enabled": true });
    expect(p.requiredForCustomers).toBe(false);
  });

  it('returns permissive defaults and does not throw on error', async () => {
    mockFlags.mockRejectedValue(new Error("DB unavailable"));
    mockSumsub.mockResolvedValue(null);
    const p = await resolveVerificationPolicy(null);
    expect(p.mode).toBe("manual");
    expect(p.manualEnabled).toBe(true);
    expect(p.sumsubEnabled).toBe(false);
    expect(p.requiredForProviders).toBe(false);
    expect(p.requiredForPayouts).toBe(false);
    expect(p.requiredForCustomers).toBe(false);
  });
});

// ── isProviderVerificationApproved ────────────────────────────────────────────

describe("isProviderVerificationApproved", () => {
  function stubAdmin(kycStatus: string | null, isVerified: boolean, identityVerified = false) {
    mockAdmin.mockReturnValue({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === "provider_verification_status") {
                return { data: kycStatus ? { status: kycStatus } : null, error: null };
              }
              if (table === "providers") {
                return { data: { is_verified: isVerified, user_id: "user-1" }, error: null };
              }
              if (table === "users") {
                return {
                  data: { identity_verified: identityVerified, identity_verification_status: identityVerified ? "approved" : "pending" },
                  error: null,
                };
              }
              return { data: null, error: null };
            },
          }),
        }),
      }),
    });
  }

  it('returns true when providers.is_verified is true', async () => {
    stubAdmin(null, true);
    expect(await isProviderVerificationApproved("p1")).toBe(true);
  });

  it('returns true when provider_verification_status is approved', async () => {
    stubAdmin("approved", false);
    expect(await isProviderVerificationApproved("p1")).toBe(true);
  });

  it('returns true when users.identity_verified is true', async () => {
    stubAdmin(null, false, true);
    expect(await isProviderVerificationApproved("p1")).toBe(true);
  });

  it('returns false when nothing is approved', async () => {
    stubAdmin("pending", false, false);
    expect(await isProviderVerificationApproved("p1")).toBe(false);
  });
});

// ── isCustomerVerificationApproved ────────────────────────────────────────────

describe("isCustomerVerificationApproved", () => {
  function stubCustomerAdmin(identityVerified: boolean, status: string) {
    mockAdmin.mockReturnValue({
      from: (_table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { identity_verified: identityVerified, identity_verification_status: status },
              error: null,
            }),
          }),
        }),
      }),
    });
  }

  it('returns true when users.identity_verified is true', async () => {
    stubCustomerAdmin(true, "approved");
    expect(await isCustomerVerificationApproved("u1")).toBe(true);
  });

  it('returns true when identity_verification_status is approved but identity_verified is false', async () => {
    stubCustomerAdmin(false, "approved");
    expect(await isCustomerVerificationApproved("u1")).toBe(true);
  });

  it('returns false when status is pending and identity_verified is false', async () => {
    stubCustomerAdmin(false, "pending");
    expect(await isCustomerVerificationApproved("u1")).toBe(false);
  });

  it('returns false when user row is null', async () => {
    mockAdmin.mockReturnValue({
      from: (_table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    });
    expect(await isCustomerVerificationApproved("u1")).toBe(false);
  });

  it('returns false and does not throw when supabase errors', async () => {
    mockAdmin.mockReturnValue({
      from: (_table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => { throw new Error("DB error"); },
          }),
        }),
      }),
    });
    expect(await isCustomerVerificationApproved("u1")).toBe(false);
  });
});
