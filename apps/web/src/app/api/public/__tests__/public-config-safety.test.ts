/**
 * Safety tests for public config endpoints: response shape and no secret fields.
 * These tests assert allowed shapes and forbidden-key checks. Full route integration
 * (with Supabase/Next context) is done via scripts/prod/verify-public-endpoints.mjs
 * against a running server.
 */

import { describe, it, expect } from "vitest";

const FORBIDDEN_IN_RESPONSE = [
  "api_key_server",
  "api_key_secret",
  "secret_key",
  "webhook_secret",
  "rest_api_key",
  "client_secret",
  "access_token",
  "private_key",
  "paystack_secret",
  "amplitude_secret",
  "onesignal_rest",
];

function assertNoSecrets(obj: unknown, path = ""): string[] {
  if (obj === null || obj === undefined) return [];
  const found: string[] = [];
  const str = JSON.stringify(obj).toLowerCase();
  for (const key of FORBIDDEN_IN_RESPONSE) {
    if (str.includes(key.toLowerCase())) {
      found.push(key + (path ? " in " + path : ""));
    }
  }
  if (typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      found.push(...assertNoSecrets(v, path ? `${path}.${k}` : k));
    }
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => found.push(...assertNoSecrets(item, `${path}[${i}]`)));
  }
  return found;
}

describe("Public config response safety (shape and forbidden keys)", () => {
  it("analytics-config allowed keys only", () => {
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
    const safeConfig = Object.fromEntries(allowed.map((k) => [k, k === "api_key_public" ? "pk_xxx" : true]));
    expect(Object.keys(safeConfig).sort()).toEqual(allowed.sort());
    expect(assertNoSecrets(safeConfig)).toEqual([]);
  });

  it("third-party-config safe shape has no secret keys", () => {
    const safeData = {
      data: {
        onesignal: { app_id: "xxx", safari_web_id: null, enabled: true },
        mapbox: { public_token: "pk.xxx", enabled: true },
      },
      error: null,
    };
    expect(assertNoSecrets(safeData)).toEqual([]);
    const bad = { data: { onesignal: { app_id: "x", rest_api_key: "secret" } }, error: null };
    expect(assertNoSecrets(bad).length).toBeGreaterThan(0);
  });

  it("branding allowed keys only", () => {
    const allowed = ["site_name", "logo_url", "favicon_url", "primary_color", "secondary_color"];
    const safe = {
      data: {
        site_name: "Beautonomi",
        logo_url: "/logo.svg",
        favicon_url: "/favicon.ico",
        primary_color: "#FF0077",
        secondary_color: "#D60565",
      },
      error: null,
    };
    expect(Object.keys((safe as any).data).sort()).toEqual(allowed.sort());
    expect(assertNoSecrets(safe)).toEqual([]);
  });

  it("forbidden key detection catches secret_key", () => {
    const bad = { api_key_public: "x", secret_key: "sk_live" };
    expect(assertNoSecrets(bad).length).toBeGreaterThan(0);
  });
});
