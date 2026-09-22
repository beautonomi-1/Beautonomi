#!/usr/bin/env node
/**
 * End-to-end smoke for worldwide install / ZA service (no auth required for public legs).
 * Usage: node scripts/market-worldwide-e2e-smoke.mjs [baseUrl]
 */
const base = (process.argv[2] || process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);

const failures = [];
const passes = [];

function pass(msg) {
  passes.push(msg);
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
}

async function json(path, init) {
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { res, body };
}

async function main() {
  console.log(`Market worldwide E2E smoke → ${base}\n`);

  // 1. Public apps coalesce
  try {
    const { res, body } = await json("/api/public/apps?type=customer&platform=ios");
    if (res.status !== 200) fail(`GET /api/public/apps status ${res.status}`);
    else {
      const url = body?.data?.app_store_url ?? body?.app_store_url;
      if (typeof url === "string" && url.includes("6748387058")) {
        pass("customer iOS app_store_url contains canonical id6748387058");
      } else {
        fail(`customer iOS app_store_url missing canonical id (got ${url})`);
      }
    }
  } catch (e) {
    fail(`GET /api/public/apps — ${e.message}`);
  }

  try {
    const { res, body } = await json("/api/public/apps?type=provider&platform=ios");
    const url = body?.data?.app_store_url ?? body?.app_store_url;
    if (res.status === 200 && typeof url === "string" && url.includes("6748387936")) {
      pass("provider iOS app_store_url contains canonical id6748387936");
    } else {
      fail(`provider iOS URL check failed (status ${res.status}, url ${url})`);
    }
  } catch (e) {
    fail(`GET /api/public/apps provider — ${e.message}`);
  }

  // 2. Visitor country on tenant-context (geo before host)
  try {
    const { res, body } = await json("/api/public/tenant-context", {
      headers: {
        Host: "beautonomi.co.za",
        "cf-ipcountry": "US",
      },
    });
    const availability = body?.data?.availability ?? body?.availability;
    const visitor = body?.data?.visitor ?? body?.visitor;
    if (res.status !== 200) fail(`tenant-context status ${res.status}`);
    else if (availability?.countryCode === "US" && availability?.status === "unsupported") {
      pass("tenant-context: US visitor on ZA host → unsupported");
    } else if (visitor?.countryCode === "US") {
      pass("tenant-context: visitor.countryCode US (availability may vary without full stack)");
    } else {
      fail(
        `tenant-context US geo expected unsupported/US visitor, got availability=${JSON.stringify(availability)} visitor=${JSON.stringify(visitor)}`,
      );
    }
  } catch (e) {
    fail(`tenant-context geo — ${e.message}`);
  }

  // 3. City waitlist validation (no contact)
  try {
    const { res } = await json("/api/public/city-waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ city_name: "Austin", name: "Test User" }),
    });
    if (res.status === 400) pass("city-waitlist rejects name+city without email/phone");
    else fail(`city-waitlist expected 400 without contact, got ${res.status}`);
  } catch (e) {
    fail(`city-waitlist POST — ${e.message}`);
  }

  // 4. Market opt-in cookie
  try {
    const { res } = await json("/api/public/market-opt-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ country_code: "ZA" }),
    });
    const setCookie = res.headers.get("set-cookie") || "";
    if (res.status === 200 && setCookie.includes("beautonomi_shop_market=ZA")) {
      pass("market-opt-in sets beautonomi_shop_market=ZA cookie");
    } else {
      fail(`market-opt-in expected 200 + cookie, status ${res.status}, cookie ${setCookie.slice(0, 80)}`);
    }
  } catch (e) {
    fail(`market-opt-in — ${e.message}`);
  }

  // 5. Transaction guard shape (booking without shop opt-in from US visitor)
  try {
    const { res, body } = await json("/api/public/bookings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-ipcountry": "US",
        Host: "beautonomi.co.za",
      },
      body: JSON.stringify({}),
    });
    const code = body?.code ?? body?.error?.code;
    if (
      res.status === 403 &&
      (code === "MARKET_OPT_IN_REQUIRED" || code === "VALIDATION_ERROR" || code === "AUTH_REQUIRED")
    ) {
      pass(`bookings POST from US without opt-in blocked or pre-auth (${res.status} ${code})`);
    } else if (res.status === 401 || res.status === 400) {
      pass(`bookings POST reached auth/validation before full create (${res.status})`);
    } else {
      fail(`bookings POST unexpected ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
    }
  } catch (e) {
    fail(`bookings guard — ${e.message}`);
  }

  // 6. Admin city-waitlist requires auth
  try {
    const { res } = await json("/api/admin/city-waitlist");
    if (res.status === 401 || res.status === 403) {
      pass("admin city-waitlist requires auth");
    } else {
      fail(`admin city-waitlist expected 401/403 without session, got ${res.status}`);
    }
  } catch (e) {
    fail(`admin city-waitlist — ${e.message}`);
  }

  console.log(`\n${passes.length} passed, ${failures.length} failed`);
  if (failures.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
