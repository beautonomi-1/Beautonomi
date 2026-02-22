#!/usr/bin/env node
/**
 * Verifies that public config endpoints do not return known secret field names.
 * Safe to run against local or staging (GET only). Non-destructive.
 *
 * Usage:
 *   node scripts/prod/verify-public-endpoints.mjs
 *   BASE_URL=https://staging.example.com node scripts/prod/verify-public-endpoints.mjs
 *
 * Requires BASE_URL to be reachable (e.g. dev server running or staging URL).
 * If BASE_URL is not set, defaults to http://localhost:3000.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const FORBIDDEN_KEYS = [
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
  "webhook_secret_secret",
];

const PUBLIC_ROUTES = [
  { path: "/api/public/analytics-config?environment=production", name: "analytics-config" },
  { path: "/api/public/third-party-config", name: "third-party-config" },
  { path: "/api/public/third-party-config?service=onesignal", name: "third-party-config (onesignal)" },
  { path: "/api/public/settings/branding", name: "settings/branding" },
  { path: "/api/public/config-bundle?platform=web&environment=production", name: "config-bundle" },
  { path: "/api/feature-flags/check?key=test.key", name: "feature-flags/check" },
];

function containsForbidden(obj, path = "") {
  if (obj === null || obj === undefined) return [];
  const found = [];
  const str = JSON.stringify(obj).toLowerCase();
  for (const key of FORBIDDEN_KEYS) {
    if (str.includes(key.toLowerCase())) {
      found.push({ key, path: path || "response" });
    }
  }
  if (typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      found.push(...containsForbidden(v, path ? `${path}.${k}` : k));
    }
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => found.push(...containsForbidden(item, `${path}[${i}]`)));
  }
  return found;
}

async function main() {
  let allPassed = true;
  const results = [];

  for (const { path, name } of PUBLIC_ROUTES) {
    const url = BASE_URL + path;
    try {
      const res = await fetch(url);
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        const lower = text.toLowerCase();
        const leak = FORBIDDEN_KEYS.some((k) => lower.includes(k.toLowerCase()));
        if (leak) {
          results.push({ route: name, status: "fail", reason: "invalid JSON but response contains forbidden key" });
          allPassed = false;
        } else {
          results.push({ route: name, status: "warn", reason: "invalid JSON (e.g. 500/HTML)", httpStatus: res.status });
        }
        continue;
      }
      const forbidden = containsForbidden(body);
      if (forbidden.length > 0) {
        results.push({ route: name, status: "fail", forbidden });
        allPassed = false;
      } else {
        results.push({ route: name, status: "ok", httpStatus: res.status });
      }
    } catch (e) {
      results.push({ route: name, status: "error", message: e.message });
      allPassed = false;
    }
  }

  console.log(JSON.stringify({ baseUrl: BASE_URL, results }, null, 2));
  if (!allPassed) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
