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
  MOBILE_WEB_USER_AGENT_TOKEN: "BeautonomiApp/provider",
}));

jest.mock("@/lib/device-default-country-dial", () => ({
  getDeviceLocaleCountryIso: jest.fn(() => "ZA"),
}));

jest.mock("@/lib/market/shop-market-opt-in", () => ({
  getShopMarketHeaderSync: jest.fn(() => ({})),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("fetchConfigBundle", () => {
  beforeEach(() => {
    clearConfigBundleCache();
    mockFetch.mockReset();
  });

  it("caches a successful bundle with meta", async () => {
    const payload = {
      meta: {
        env: "production",
        platform: "provider",
        version: null,
        fetched_at: "2026-01-01T00:00:00.000Z",
        tenant_id: "tenant-1",
      },
      amplitude: {},
      third_party: {},
      branding: {},
      auth: {},
      flags: { payment_paycloud: { enabled: true } },
      modules: {
        on_demand: { enabled: false, ringtone_asset_path: null, ring_duration_seconds: 20, ring_repeat: true, normal_booking_ringtone_asset_path: null, normal_booking_ring_duration_seconds: 20, normal_booking_ring_repeat: true, waiting_screen_timeout_seconds: 45, provider_accept_window_seconds: 30, ui_copy: {} },
        ai: {},
        ads: {},
        ranking: {},
        identity_verification: {},
        aura: {},
        safety: {},
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => payload,
    });

    const first = await fetchConfigBundle({ platform: "provider", environment: "production" });
    expect(isConfigBundleStub(first)).toBe(false);
    expect(first.flags.payment_paycloud?.enabled).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    const second = await fetchConfigBundle({ platform: "provider", environment: "production" });
    expect(second.flags.payment_paycloud?.enabled).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getCachedConfigBundle()?.flags.payment_paycloud?.enabled).toBe(true);
  });

  it("does not cache failed responses and retries on the next call", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "blocked" }),
    });

    const first = await fetchConfigBundle({ platform: "provider", environment: "production" });
    expect(isConfigBundleStub(first)).toBe(true);
    expect(getCachedConfigBundle()).toBeNull();

    const payload = {
      meta: {
        env: "production",
        platform: "provider",
        version: null,
        fetched_at: "2026-01-01T00:00:00.000Z",
        tenant_id: "tenant-1",
      },
      amplitude: {},
      third_party: {},
      branding: {},
      auth: {},
      flags: { payment_paycloud: { enabled: true } },
      modules: {
        on_demand: { enabled: false, ringtone_asset_path: null, ring_duration_seconds: 20, ring_repeat: true, normal_booking_ringtone_asset_path: null, normal_booking_ring_duration_seconds: 20, normal_booking_ring_repeat: true, waiting_screen_timeout_seconds: 45, provider_accept_window_seconds: 30, ui_copy: {} },
        ai: {},
        ads: {},
        ranking: {},
        identity_verification: {},
        aura: {},
        safety: {},
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => payload,
    });

    const second = await fetchConfigBundle({ platform: "provider", environment: "production" });
    expect(isConfigBundleStub(second)).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("sends BeautonomiApp provider User-Agent on fetch", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        meta: {
          env: "production",
          platform: "provider",
          version: null,
          fetched_at: "2026-01-01T00:00:00.000Z",
        },
        amplitude: {},
        third_party: {},
        branding: {},
        auth: {},
        flags: {},
        modules: {
          on_demand: { enabled: false, ringtone_asset_path: null, ring_duration_seconds: 20, ring_repeat: true, normal_booking_ringtone_asset_path: null, normal_booking_ring_duration_seconds: 20, normal_booking_ring_repeat: true, waiting_screen_timeout_seconds: 45, provider_accept_window_seconds: 30, ui_copy: {} },
          ai: {},
          ads: {},
          ranking: {},
          identity_verification: {},
          aura: {},
          safety: {},
        },
      }),
    });

    await fetchConfigBundle({ platform: "provider", environment: "production" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/public/config-bundle"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "BeautonomiApp/provider",
        }),
      }),
    );
  });
});
