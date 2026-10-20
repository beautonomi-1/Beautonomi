import {
  clearConfigBundleCache,
  fetchConfigBundle,
  getCachedConfigBundle,
  isConfigBundleStub,
} from "@/lib/config-bundle";

jest.mock("@/config/public-env", () => ({
  getBackendUrl: jest.fn(() => "https://www.beautonomi.com"),
  withWebApiTenantHeaders: (init?: RequestInit) => init ?? {},
  DEFAULT_REGION_CURRENCY: "ZAR",
}));

jest.mock("@/lib/device-default-country-dial", () => ({
  getDeviceLocaleCountryIso: jest.fn(() => "ZA"),
}));

jest.mock("@/lib/market/shop-market-opt-in", () => ({
  getShopMarketHeaderSync: jest.fn(() => ({})),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const basePayload = {
  meta: {
    env: "production",
    platform: "customer",
    version: null,
    fetched_at: "2026-01-01T00:00:00.000Z",
  },
  amplitude: {},
  third_party: {},
  branding: {},
  auth: {},
  flags: { "explore.enabled": { enabled: true } },
  modules: {
    on_demand: {
      enabled: false,
      ringtone_asset_path: null,
      ring_duration_seconds: 20,
      ring_repeat: true,
      normal_booking_ringtone_asset_path: null,
      normal_booking_ring_duration_seconds: 20,
      normal_booking_ring_repeat: true,
      waiting_screen_timeout_seconds: 45,
      provider_accept_window_seconds: 30,
      ui_copy: {},
    },
    ai: {},
    ads: {},
    ranking: {},
    distance: {},
    identity_verification: {},
    aura: {},
    safety: {},
  },
};

describe("fetchConfigBundle (customer)", () => {
  beforeEach(() => {
    clearConfigBundleCache();
    mockFetch.mockReset();
  });

  it("caches a successful bundle with explore flag", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => basePayload,
    });

    const first = await fetchConfigBundle({ platform: "customer", environment: "production" });
    expect(isConfigBundleStub(first)).toBe(false);
    expect(first.flags["explore.enabled"]?.enabled).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const second = await fetchConfigBundle({ platform: "customer", environment: "production" });
    expect(second.flags["explore.enabled"]?.enabled).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getCachedConfigBundle()?.flags["explore.enabled"]?.enabled).toBe(true);
  });

  it("does not cache failed responses and retries on the next call", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });

    const first = await fetchConfigBundle({ platform: "customer", environment: "production" });
    expect(isConfigBundleStub(first)).toBe(true);
    expect(getCachedConfigBundle()).toBeNull();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => basePayload,
    });

    const second = await fetchConfigBundle({ platform: "customer", environment: "production" });
    expect(isConfigBundleStub(second)).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("includes user_id in the config-bundle URL and does not reuse cache across users", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => basePayload,
    });
    await fetchConfigBundle({ platform: "customer", environment: "production", userId: "user-a" });
    expect(mockFetch.mock.calls[0][0]).toContain("user_id=user-a");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...basePayload,
        flags: { "explore.enabled": { enabled: false } },
      }),
    });
    await fetchConfigBundle({ platform: "customer", environment: "production", userId: "user-b" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toContain("user_id=user-b");
  });

  it("treats flags_unavailable meta as a stub and does not cache", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...basePayload,
        flags: {},
        meta: { ...basePayload.meta, flags_unavailable: true },
      }),
    });

    const first = await fetchConfigBundle({ platform: "customer", environment: "production" });
    expect(isConfigBundleStub(first)).toBe(true);
    expect(getCachedConfigBundle()).toBeNull();
  });
});
