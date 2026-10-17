/**
 * Config bundle API tests: safety (no secrets), structure, rollout determinism.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
import * as configModule from "@/lib/config";
import { resolveFlagsForUser } from "@/lib/config";
import type { ResolveFlagsForUserParams } from "@/lib/config/types";

const FORBIDDEN_KEYS = [
  "api_key_server",
  "api_key_secret",
  "app_token_secret",
  "secret_key_secret",
  "webhook_secret_secret",
  "api_key_secret",
];

function mockSuccessfulBundle(overrides?: { platform?: string; env?: string; version?: string | null }) {
  return {
    meta: {
      env: overrides?.env ?? "production",
      platform: overrides?.platform ?? "web",
      version: overrides?.version ?? null,
      fetched_at: "2026-01-01T00:00:00.000Z",
    },
    amplitude: {
      api_key_public: null,
      environment: "production",
      enabled_client_portal: false,
      enabled_provider_portal: false,
      enabled_admin_portal: false,
      guides_enabled: false,
      surveys_enabled: false,
      sampling_rate: 1,
      debug_mode: false,
    },
    third_party: {},
    branding: {
      site_name: "Beautonomi",
      logo_url: "/images/logo.svg",
      favicon_url: "/icon.svg",
      primary_color: "#FF0077",
      secondary_color: "#D60565",
    },
    auth: {},
    flags: {},
    modules: {
      on_demand: { enabled: false, ringtone_asset_path: null, ring_duration_seconds: 20, ring_repeat: true, normal_booking_ringtone_asset_path: null, normal_booking_ring_duration_seconds: 20, normal_booking_ring_repeat: true, waiting_screen_timeout_seconds: 45, provider_accept_window_seconds: 30, ui_copy: {} },
      ai: { enabled: false, sampling_rate: 0, cache_ttl_seconds: 86400, default_model_tier: "cheap", max_tokens: 600, temperature: 0.3, daily_budget_credits: 0, per_provider_calls_per_day: 0, per_user_calls_per_day: 0 },
      ads: { enabled: false },
      ranking: { enabled: false, weights: {} },
      distance: { enabled: false },
      sumsub: { enabled: false },
      identity_verification: { enabled: false, provider: "none" },
      aura: { enabled: false },
      safety: { enabled: false, check_in_enabled: true, escalation_enabled: true, cooldown_seconds: 300, ui_copy: {} },
      agents: { enabled: false, shadow_mode: true },
    },
    verification: {
      mode: "off",
      sumsub_enabled: false,
      didit_enabled: false,
      manual_enabled: true,
      required_for_providers: false,
      required_for_payouts: false,
      required_for_customers: false,
      cross_validate: false,
      min_age: 18,
      kyb_enabled: false,
      kyb_required_for_business: false,
    },
    content_safety: {
      social_min_age: 13,
      social_age_gate_mode: "enforce",
      controls_enabled: true,
    },
  };
}

describe("GET /api/public/config-bundle", () => {
  beforeEach(() => {
    vi.spyOn(configModule, "getPublicConfigBundle").mockResolvedValue(mockSuccessfulBundle() as Awaited<
      ReturnType<typeof configModule.getPublicConfigBundle>
    >);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 and does not include any secret fields", async () => {
    const request = new NextRequest("http://localhost/api/public/config-bundle?platform=web&environment=production");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.meta).toBeDefined();
    expect(data.amplitude).toBeDefined();
    expect(data.third_party).toBeDefined();
    expect(data.branding).toBeDefined();
    expect(data.flags).toBeDefined();
    expect(data.modules).toBeDefined();

    const str = JSON.stringify(data);
    for (const key of FORBIDDEN_KEYS) {
      expect(str).not.toContain(key);
    }
  });

  it("returns only whitelisted amplitude fields", async () => {
    const request = new NextRequest("http://localhost/api/public/config-bundle?platform=web&environment=production");
    const response = await GET(request);
    const data = await response.json();

    const amplitudeKeys = Object.keys(data.amplitude);
    const allowed = [
      "api_key_public",
      "environment",
      "enabled_client_portal",
      "enabled_provider_portal",
      "enabled_admin_portal",
      "guides_enabled",
      "surveys_enabled",
      "sampling_rate",
      "debug_mode",
    ];
    expect(amplitudeKeys.sort()).toEqual(allowed.sort());
  });

  it("returns meta with env, platform, version, fetched_at", async () => {
    vi.mocked(configModule.getPublicConfigBundle).mockResolvedValueOnce(
      mockSuccessfulBundle({ platform: "provider", env: "staging", version: "1.2.3" }) as Awaited<
        ReturnType<typeof configModule.getPublicConfigBundle>
      >,
    );
    const request = new NextRequest("http://localhost/api/public/config-bundle?platform=provider&environment=staging&app_version=1.2.3");
    const response = await GET(request);
    const data = await response.json();

    expect(data.meta.env).toBe("staging");
    expect(data.meta.platform).toBe("provider");
    expect(data.meta.version).toBe("1.2.3");
    expect(data.meta.fetched_at).toBeDefined();
    expect(typeof data.meta.fetched_at).toBe("string");
    expect(data.meta.active_market_country).toMatch(/^[A-Z]{2}$/);
    expect(data.meta.active_market_source).toBeDefined();
  });

  it("sets cache and etag headers", async () => {
    const request = new NextRequest("http://localhost/api/public/config-bundle");
    const response = await GET(request);

    const cacheControl = response.headers.get("Cache-Control") ?? "";
    expect(cacheControl).toContain("s-maxage=300");
    expect(response.headers.get("ETag")).toBeDefined();
  });

  it("returns 503 with no-store when getPublicConfigBundle throws", async () => {
    vi.mocked(configModule.getPublicConfigBundle).mockRejectedValueOnce(new Error("db down"));

    const request = new NextRequest("http://localhost/api/public/config-bundle?platform=customer");
    const response = await GET(request);

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("resolveFlagsForUser", () => {
  it("is deterministic for fixed userId and flagKey", () => {
    const flags = [
      { feature_key: "test.flag", enabled: true, rollout_percent: 50, platforms_allowed: null, roles_allowed: null, min_app_version: null, environments_allowed: null },
    ];
    const params: ResolveFlagsForUserParams = {
      flags,
      userId: "user-123",
      role: "customer",
      platform: "web",
      appVersion: null,
      environment: "production",
    };

    const a = resolveFlagsForUser(params);
    const b = resolveFlagsForUser(params);
    expect(a["test.flag"].enabled).toBe(b["test.flag"].enabled);
  });

  it("always allows superadmin regardless of rollout", () => {
    const flags = [
      { feature_key: "premium", enabled: true, rollout_percent: 0, platforms_allowed: null, roles_allowed: null, min_app_version: null, environments_allowed: null },
    ];
    const params: ResolveFlagsForUserParams = {
      flags,
      userId: "admin-1",
      role: "superadmin",
      platform: "web",
      appVersion: null,
      environment: "production",
    };

    const result = resolveFlagsForUser(params);
    expect(result["premium"].enabled).toBe(true);
  });

  it("disables when enabled is false", () => {
    const flags = [
      { feature_key: "off", enabled: false, rollout_percent: 100, platforms_allowed: null, roles_allowed: null, min_app_version: null, environments_allowed: null },
    ];
    const result = resolveFlagsForUser({
      flags,
      userId: "user-1",
      role: "customer",
      platform: "web",
      appVersion: null,
      environment: "production",
    });
    expect(result["off"].enabled).toBe(false);
  });

  it("payment_paystack_virtual_terminal resolves per platform when platforms_allowed is provider-only", () => {
    const flags = [
      {
        feature_key: "payment_paystack_virtual_terminal",
        enabled: true,
        rollout_percent: 100,
        platforms_allowed: ["provider"],
        roles_allowed: null,
        min_app_version: null,
        environments_allowed: null,
      },
    ];
    const providerResult = resolveFlagsForUser({
      flags,
      userId: "provider-owner-1",
      role: "provider_owner",
      platform: "provider",
      appVersion: null,
      environment: "production",
    });
    const webResult = resolveFlagsForUser({
      flags,
      userId: "provider-owner-1",
      role: "provider_owner",
      platform: "web",
      appVersion: null,
      environment: "production",
    });
    expect(providerResult["payment_paystack_virtual_terminal"].enabled).toBe(true);
    expect(webResult["payment_paystack_virtual_terminal"].enabled).toBe(false);
  });

  it("payment_paystack_virtual_terminal resolves on both web and provider when both are allowed", () => {
    const flags = [
      {
        feature_key: "payment_paystack_virtual_terminal",
        enabled: true,
        rollout_percent: 100,
        platforms_allowed: ["web", "provider"],
        roles_allowed: null,
        min_app_version: null,
        environments_allowed: null,
      },
    ];
    for (const platform of ["web", "provider"] as const) {
      const result = resolveFlagsForUser({
        flags,
        userId: "provider-owner-1",
        role: "provider_owner",
        platform,
        appVersion: null,
        environment: "production",
      });
      expect(result["payment_paystack_virtual_terminal"].enabled).toBe(true);
    }
  });
});
