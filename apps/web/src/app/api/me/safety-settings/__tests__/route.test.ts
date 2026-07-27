import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockResolveAgeBand = vi.fn();
const mockReadSafetySettingsStored = vi.fn();
const mockWriteSafetySettingsStored = vi.fn();
const mockEffectiveSafetySettings = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenantIdWithZaFallback(...args),
}));

vi.mock("@/lib/age-assurance", () => ({
  resolveAgeBand: (...args: unknown[]) => mockResolveAgeBand(...args),
  readSafetySettingsStored: (...args: unknown[]) => mockReadSafetySettingsStored(...args),
  writeSafetySettingsStored: (...args: unknown[]) => mockWriteSafetySettingsStored(...args),
  effectiveSafetySettings: (...args: unknown[]) => mockEffectiveSafetySettings(...args),
}));

const teenLockedEffective = {
  restricted_mode: { value: true, locked: true },
  hide_social_feed: { value: true, locked: true },
  disable_comments_likes: { value: true, locked: true },
  disable_direct_messaging: { value: false, locked: false },
  sensitive_content_filter: { value: true, locked: true },
  require_device_auth: { value: true, locked: true },
};

const teenLockedAfterPatch = {
  ...teenLockedEffective,
  disable_direct_messaging: { value: true, locked: false },
};

describe("PATCH /api/me/safety-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-teen" } });
    mockGetSupabaseServer.mockResolvedValue({});
    mockResolveTenantIdWithZaFallback.mockResolvedValue(null);
    mockResolveAgeBand.mockResolvedValue({ band: "13_17", source: "declared_dob" });
    mockReadSafetySettingsStored.mockResolvedValue({});
    mockWriteSafetySettingsStored.mockResolvedValue({ disable_direct_messaging: true });
  });

  it("rejects PATCH that tries to disable a locked setting", async () => {
    mockEffectiveSafetySettings.mockResolvedValue(teenLockedEffective);

    const { PATCH } = await import("../route");
    const request = new NextRequest("http://localhost/api/me/safety-settings", {
      method: "PATCH",
      body: JSON.stringify({ restricted_mode: false }),
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("SAFETY_SETTING_LOCKED");
    expect(mockWriteSafetySettingsStored).not.toHaveBeenCalled();
  });

  it("allows PATCH for an unlocked setting", async () => {
    mockEffectiveSafetySettings
      .mockResolvedValueOnce(teenLockedEffective)
      .mockResolvedValueOnce(teenLockedAfterPatch);

    const { PATCH } = await import("../route");
    const request = new NextRequest("http://localhost/api/me/safety-settings", {
      method: "PATCH",
      body: JSON.stringify({ disable_direct_messaging: true }),
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data?.disable_direct_messaging).toBe(true);
    expect(body.data?.locked?.restricted_mode).toBe(true);
    expect(mockWriteSafetySettingsStored).toHaveBeenCalledWith(
      "user-teen",
      expect.anything(),
      { disable_direct_messaging: true },
    );
  });

  it("allows PATCH that sets a locked setting to its current value", async () => {
    mockEffectiveSafetySettings.mockResolvedValue(teenLockedEffective);
    mockWriteSafetySettingsStored.mockResolvedValue({ restricted_mode: true });

    const { PATCH } = await import("../route");
    const request = new NextRequest("http://localhost/api/me/safety-settings", {
      method: "PATCH",
      body: JSON.stringify({ restricted_mode: true }),
    });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data?.restricted_mode).toBe(true);
    expect(mockWriteSafetySettingsStored).toHaveBeenCalled();
  });
});

describe("GET /api/me/safety-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-teen" } });
    mockGetSupabaseServer.mockResolvedValue({});
    mockResolveTenantIdWithZaFallback.mockResolvedValue(null);
    mockResolveAgeBand.mockResolvedValue({ band: "13_17", source: "declared_dob" });
    mockReadSafetySettingsStored.mockResolvedValue({});
    mockEffectiveSafetySettings.mockResolvedValue(teenLockedEffective);
  });

  it("returns effective settings with locked map and age band", async () => {
    const { GET } = await import("../route");
    const request = new NextRequest("http://localhost/api/me/safety-settings");

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data?.age_band).toBe("13_17");
    expect(body.data?.restricted_mode).toBe(true);
    expect(body.data?.locked?.hide_social_feed).toBe(true);
  });
});
