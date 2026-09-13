#!/usr/bin/env node
/**
 * HTTP smoke test against a running Next.js dev or preview server.
 * Usage: node scripts/route-smoke.mjs [baseUrl]
 */
const baseUrl = (process.argv[2] || process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);

const RSC_ERROR_MARKERS = [
  "createContext only works in Client Components",
  "You're importing a component that needs",
  "An error occurred in the Server Components render",
];

/** @type {{ path: string, expectStatus?: number | ((n: number) => boolean) }[]} */
const routes = [
  { path: "/" },
  { path: "/search" },
  { path: "/explore" },
  { path: "/login" },
  { path: "/account-settings" },
  { path: "/account-settings/preferences" },
  { path: "/account-settings/bookings" },
  { path: "/provider/dashboard" },
  { path: "/provider/calendar" },
  { path: "/manifest.webmanifest" },
  { path: "/api/public/home" },
  { path: "/api/public/config-bundle?platform=web&environment=development" },
  { path: "/api/public/tenant-context" },
  { path: "/api/public/languages" },
  { path: "/api/public/preference-options?type=language" },
  { path: "/api/me/profile", expectStatus: (n) => n === 401 || n === 403 },
];

const failures = [];
const timings = [];

async function checkRoute({ path, expectStatus }) {
  const url = `${baseUrl}${path}`;
  const started = performance.now();
  let res;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: { Accept: "text/html,application/json,*/*" },
    });
  } catch (err) {
    failures.push(`${path}: fetch failed — ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const ms = Math.round(performance.now() - started);
  timings.push({ path, status: res.status, ms });

  const contentType = res.headers.get("content-type") || "";
  const body = contentType.includes("text/html") || contentType.includes("application/json")
    ? await res.text()
    : "";

  const statusOk =
    typeof expectStatus === "function"
      ? expectStatus(res.status)
      : expectStatus !== undefined
        ? res.status === expectStatus
        : res.status < 400;

  if (!statusOk) {
    failures.push(`${path}: expected acceptable status, got ${res.status}`);
  }

  for (const marker of RSC_ERROR_MARKERS) {
    if (body.includes(marker)) {
      failures.push(`${path}: RSC/runtime error marker found (${marker.slice(0, 40)}…)`);
      break;
    }
  }
}

console.log(`Route smoke against ${baseUrl}\n`);

for (const route of routes) {
  await checkRoute(route);
}

const slow = timings.filter((t) => t.ms > 8000);
for (const t of timings) {
  const flag = t.ms > 8000 ? " SLOW" : "";
  console.log(`  ${t.status} ${String(t.ms).padStart(5)}ms  ${t.path}${flag}`);
}

if (slow.length > 0) {
  console.warn(`\n${slow.length} route(s) exceeded 8s (cold compile in dev is normal on first hit).`);
}

if (failures.length > 0) {
  console.error("\nSmoke FAILED:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}

console.log(`\nSmoke passed (${routes.length} routes).`);
process.exit(0);
