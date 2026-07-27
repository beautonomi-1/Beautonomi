import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockResolveTenantIdWithZaFallback = vi.fn();
const mockResolveAgeAssurancePolicy = vi.fn();
const mockResolveAgeBand = vi.fn();
const mockReadSafetySettingsStored = vi.fn();
const mockEffectiveSafetySettings = vi.fn();
const mockCapabilityBlocked = vi.fn();
const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenantIdWithZaFallback(...args),
}));

vi.mock("@/lib/age-assurance", () => ({
  resolveAgeAssurancePolicy: (...args: unknown[]) => mockResolveAgeAssurancePolicy(...args),
  resolveAgeBand: (...args: unknown[]) => mockResolveAgeBand(...args),
  readSafetySettingsStored: (...args: unknown[]) => mockReadSafetySettingsStored(...args),
  effectiveSafetySettings: (...args: unknown[]) => mockEffectiveSafetySettings(...args),
  capabilityBlocked: (...args: unknown[]) => mockCapabilityBlocked(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/explore/posts/1/comments", { method: "POST" });
}

const unrestrictedEffective = {
  restricted_mode: { value: false, locked: false },
  hide_social_feed: { value: false, locked: false },
  disable_comments_likes: { value: false, locked: false },
  disable_direct_messaging: { value: false, locked: false },
  sensitive_content_filter: { value: false, locked: false },
  require_device_auth: { value: false, locked: false },
};

describe("requireSocialAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTenantIdWithZaFallback.mockResolvedValue(null);
    mockGetSupabaseServer.mockResolvedValue({});
    mockResolveAgeBand.mockResolvedValue({ band: "18_plus", source: "declared_dob" });
    mockReadSafetySettingsStored.mockResolvedValue({});
    mockEffectiveSafetySettings.mockResolvedValue(unrestrictedEffective);
    mockCapabilityBlocked.mockReturnValue(false);
    mockResolveAgeAssurancePolicy.mockResolvedValue({ socialAgeGateMode: "enforce", socialMinAge: 13 });
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("allows access when gate mode is off", async () => {
    mockResolveAgeAssurancePolicy.mockResolvedValue({ socialAgeGateMode: "off" });
    mockResolveAgeBand.mockResolvedValue({ band: "under_13", source: "under_age_flag" });

    const { requireSocialAccess } = await import("../require-social-access");
    await expect(
      requireSocialAccess("user-1", "comment", makeRequest()),
    ).resolves.toBeUndefined();
  });

  it("blocks under_13 users when mode is enforce", async () => {
    mockResolveAgeBand.mockResolvedValue({ band: "under_13", source: "under_age_flag" });

    const { requireSocialAccess, SocialAccessDeniedError } = await import("../require-social-access");
    await expect(requireSocialAccess("user-1", "comment", makeRequest())).rejects.toMatchObject({
      status: 403,
      code: "SOCIAL_RESTRICTED",
    });
    expect(SocialAccessDeniedError).toBeDefined();
  });

  it("logs but does not block under_13 when mode is log", async () => {
    mockResolveAgeAssurancePolicy.mockResolvedValue({ socialAgeGateMode: "log" });
    mockResolveAgeBand.mockResolvedValue({ band: "under_13", source: "under_age_flag" });

    const { requireSocialAccess } = await import("../require-social-access");
    await expect(
      requireSocialAccess("user-1", "comment", makeRequest()),
    ).resolves.toBeUndefined();

    expect(console.info).toHaveBeenCalledWith(
      "[safety] social access would block",
      expect.objectContaining({ userId: "user-1", capability: "comment", band: "under_13" }),
    );
  });

  it("blocks restricted 13_17 users when capability is blocked in enforce mode", async () => {
    mockResolveAgeBand.mockResolvedValue({ band: "13_17", source: "declared_dob" });
    mockCapabilityBlocked.mockReturnValue(true);

    const { requireSocialAccess } = await import("../require-social-access");
    await expect(requireSocialAccess("user-1", "like_or_save", makeRequest())).rejects.toMatchObject({
      status: 403,
      code: "SOCIAL_RESTRICTED",
    });
  });

  it("logs capability blocks in log mode without throwing", async () => {
    mockResolveAgeAssurancePolicy.mockResolvedValue({ socialAgeGateMode: "log" });
    mockResolveAgeBand.mockResolvedValue({ band: "13_17", source: "declared_dob" });
    mockCapabilityBlocked.mockReturnValue(true);

    const { requireSocialAccess } = await import("../require-social-access");
    await expect(
      requireSocialAccess("user-1", "direct_message", makeRequest()),
    ).resolves.toBeUndefined();

    expect(console.info).toHaveBeenCalledWith(
      "[safety] social access would block",
      expect.objectContaining({ reason: "safety_settings", band: "13_17" }),
    );
  });

  it("allows unknown band with unrestricted settings in enforce mode", async () => {
    mockResolveAgeBand.mockResolvedValue({ band: "unknown", source: "none" });
    mockCapabilityBlocked.mockReturnValue(false);

    const { requireSocialAccess } = await import("../require-social-access");
    await expect(
      requireSocialAccess("user-1", "ugc_create", makeRequest()),
    ).resolves.toBeUndefined();
  });

  it("logs unknown band access in log mode", async () => {
    mockResolveAgeAssurancePolicy.mockResolvedValue({ socialAgeGateMode: "log" });
    mockResolveAgeBand.mockResolvedValue({ band: "unknown", source: "none" });

    const { requireSocialAccess } = await import("../require-social-access");
    await requireSocialAccess("user-1", "review", makeRequest());

    expect(console.info).toHaveBeenCalledWith(
      "[safety] unknown age band social access",
      expect.objectContaining({ userId: "user-1", capability: "review" }),
    );
  });
});
