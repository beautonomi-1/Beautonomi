import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSupabaseAdmin = vi.fn();
const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

// Audit is best-effort on the denial path; stub it so tests stay quiet.
vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  extractRequestMeta: vi.fn().mockReturnValue({ ip_address: null, user_agent: null }),
}));

function adminRequest() {
  return new NextRequest("http://localhost:3000/api/admin/dashboard", {
    method: "GET",
  });
}

/** platform_settings admin client returning a given two_factor policy. */
function mockPolicy(twoFactor: { enabled: boolean; required_for_admins: boolean }) {
  mockGetSupabaseAdmin.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { settings: { security: { two_factor: twoFactor } } },
                error: null,
              }),
            })),
          })),
        })),
      })),
      // insert path used by writeAuditLog (stubbed module above, but keep safe)
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  });
}

/** server client exposing a given MFA assurance level. */
function mockServerAal(level: string | null, opts: { mfaAvailable?: boolean } = {}) {
  const mfaAvailable = opts.mfaAvailable ?? true;
  mockGetSupabaseServer.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } } }),
      mfa: mfaAvailable
        ? {
            getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
              data: { currentLevel: level },
              error: null,
            }),
          }
        : {},
    },
  });
}

describe("requireAdminMfaIfRequired — DB policy is authoritative", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "test";
  });

  it("throws MFA_REQUIRED when policy requires it and session is not AAL2", async () => {
    mockPolicy({ enabled: true, required_for_admins: true });
    mockServerAal("aal1");

    const { requireAdminMfaIfRequired, ADMIN_MFA_REQUIRED_CODE } = await import("../api-helpers");

    await expect(requireAdminMfaIfRequired(adminRequest(), "superadmin")).rejects.toMatchObject({
      code: ADMIN_MFA_REQUIRED_CODE,
    });
  });

  it("resolves when policy requires it and session is AAL2", async () => {
    mockPolicy({ enabled: true, required_for_admins: true });
    mockServerAal("aal2");

    const { requireAdminMfaIfRequired } = await import("../api-helpers");

    await expect(requireAdminMfaIfRequired(adminRequest(), "superadmin")).resolves.toBeUndefined();
  });

  it("does NOT require MFA when the DB policy is disabled — even in production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.NODE_ENV = "production";
    mockPolicy({ enabled: false, required_for_admins: false });
    mockServerAal("aal1");

    const { requireAdminMfaIfRequired } = await import("../api-helpers");

    await expect(requireAdminMfaIfRequired(adminRequest(), "superadmin")).resolves.toBeUndefined();
  });

  it("does not require MFA when policy is enabled but not required_for_admins", async () => {
    mockPolicy({ enabled: true, required_for_admins: false });
    mockServerAal("aal1");

    const { requireAdminMfaIfRequired } = await import("../api-helpers");

    await expect(requireAdminMfaIfRequired(adminRequest(), "superadmin")).resolves.toBeUndefined();
  });

  it("throws MFA_REQUIRED when policy requires it but the MFA API is unavailable", async () => {
    mockPolicy({ enabled: true, required_for_admins: true });
    mockServerAal(null, { mfaAvailable: false });

    const { requireAdminMfaIfRequired, ADMIN_MFA_REQUIRED_CODE } = await import("../api-helpers");

    await expect(requireAdminMfaIfRequired(adminRequest(), "superadmin")).rejects.toMatchObject({
      code: ADMIN_MFA_REQUIRED_CODE,
    });
  });

  it("skips MFA entirely for non-admin API requests", async () => {
    mockPolicy({ enabled: true, required_for_admins: true });
    mockServerAal("aal1");

    const { requireAdminMfaIfRequired } = await import("../api-helpers");

    const nonAdmin = new NextRequest("http://localhost:3000/api/me/profile", { method: "GET" });
    await expect(requireAdminMfaIfRequired(nonAdmin, "superadmin")).resolves.toBeUndefined();
  });
});
