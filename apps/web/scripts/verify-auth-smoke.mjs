#!/usr/bin/env node
/** Smoke public auth surfaces + sign-out API. */
const base = (process.argv[2] || process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

async function check(path, init) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    signal: AbortSignal.timeout(120_000),
  });
  return { path, status: res.status, ok: res.ok };
}

async function main() {
  console.log(`Auth smoke @ ${base}\n`);
  for (const path of ["/login", "/signup", "/signup?type=provider", "/forgot-password"]) {
    const r = await check(path);
    console.log(`${r.ok ? "✓" : "✗"} GET ${path} → ${r.status}`);
    if (!r.ok) process.exitCode = 1;
  }
  const out = await check("/api/auth/sign-out", { method: "POST" });
  const body = await fetch(`${base}/api/auth/sign-out`, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
  }).then((r) => r.json().catch(() => ({})));
  console.log(`${out.ok ? "✓" : "✗"} POST /api/auth/sign-out → ${out.status}`, body.ok === true ? "" : JSON.stringify(body));
  if (!out.ok || body.ok !== true) process.exitCode = 1;
}

main().catch((e) => {
  console.error("✗", e.message || e);
  process.exit(1);
});
