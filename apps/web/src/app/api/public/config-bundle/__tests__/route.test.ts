/**
 * Config bundle API tests: safety (no secrets), structure, rollout determinism.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";
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

describe("GET /api/public/config-bundle", () => {
  beforeEach(() => {
    vi.resetModules();
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
    const request = new NextRequest("http://localhost/api/public/config-bundle?platform=provider&environment=staging&app_version=1.2.3");
    const response = await GET(request);
    const data = await response.json();

    expect(data.meta.env).toBe("staging");
    expect(data.meta.platform).toBe("provider");
    expect(data.meta.version).toBe("1.2.3");
    expect(data.meta.fetched_at).toBeDefined();
    expect(typeof data.meta.fetched_at).toBe("string");
  });

  it("sets cache and etag headers", async () => {
    const request = new NextRequest("http://localhost/api/public/config-bundle");
    const response = await GET(request);

    const cacheControl = response.headers.get("Cache-Control") ?? "";
    expect(cacheControl).toContain("s-maxage=300");
    expect(response.headers.get("ETag")).toBeDefined();
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
});
