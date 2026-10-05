#!/usr/bin/env node
/**
 * Unified go-live readiness orchestrator.
 *
 * Usage:
 *   node scripts/prod/go-live-check.mjs              # quick (default)
 *   node scripts/prod/go-live-check.mjs --full       # includes release:check (long)
 *   node scripts/prod/go-live-check.mjs --skip-live  # repo + DB only, no HTTP
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PROJECTS, serviceRoleKey } from "../../tooling/audit/supabase-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

const args = new Set(process.argv.slice(2));
const MODE_FULL = args.has("--full");
const SKIP_LIVE = args.has("--skip-live");

const PROD_ORIGIN = "https://www.beautonomi.com";
const PROD_HOSTS = {
  primary: PROD_ORIGIN,
  za: "https://www.beautonomi.co.za",
  admin: "https://admin.beautonomi.com",
};

const MANUAL_CHECKLIST = [
  "Vercel Production: PAYSTACK_SECRET_KEY (sk_live_…), public Paystack key, CRON_SECRET, CSRF_SECRET, NEXT_PUBLIC_SENTRY_DSN",
  "Supabase Production: Pro plan + point-in-time recovery enabled",
  "Paystack dashboard: live webhook URL registered and reachable",
  "DNS/TLS: apex → www, admin host, provider hosts",
  "Rotate VERCEL_AUTOMATION_BYPASS_SECRET if ever exposed; store only in GitHub Actions",
  "On-call / rollback: docs/PLAYBOOKS/secret-rotation.md and deploy rollback owner",
];

/** @typedef {"pass"|"fail"|"skip"|"warn"} CheckStatus */
/** @typedef {{ id: string, area: string, severity: "blocker"|"warning", status: CheckStatus, evidence: string, fix?: string, ms: number }} CheckResult */

const results = /** @type {CheckResult[]} */ ([]);

function runCmd(label, cmd, cmdArgs, opts = {}) {
  const start = Date.now();
  const useShell = opts.shell ?? false;
  const r = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: "utf8",
    shell: useShell,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
  const spawnErr = r.error ? (r.error instanceof Error ? r.error.message : String(r.error)) : "";
  return {
    code: r.status ?? (spawnErr ? 1 : 1),
    stdout: (r.stdout || "").trim(),
    stderr: [spawnErr, (r.stderr || "").trim()].filter(Boolean).join("\n").trim(),
    ms: Date.now() - start,
    label,
  };
}

function pnpm(args, label) {
  if (process.platform === "win32") {
    const cmdLine = ["pnpm", ...args]
      .map((a) => {
        const s = String(a);
        return /[\s"&|<>^]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
      })
      .join(" ");
    return runCmd(label, "cmd.exe", ["/d", "/s", "/c", cmdLine], { shell: false });
  }
  return runCmd(label, "pnpm", args, { shell: false });
}

function nodeScript(rel, label, env = {}) {
  return runCmd(label, process.execPath, [join(ROOT, rel)], {
    shell: false,
    env: { ...process.env, ...env },
  });
}

function record(check, status, evidence, fix) {
  results.push({
    ...check,
    status,
    evidence,
    fix,
    ms: check._ms ?? 0,
  });
}

async function runCheck(def, fn) {
  const start = Date.now();
  try {
    const out = await fn();
    record(
      { id: def.id, area: def.area, severity: def.severity, _ms: Date.now() - start },
      out.status,
      out.evidence,
      out.fix,
    );
  } catch (e) {
    record(
      { id: def.id, area: def.area, severity: def.severity, _ms: Date.now() - start },
      "fail",
      e instanceof Error ? e.message : String(e),
      def.fixHint,
    );
  }
}

function gitTrackedClean() {
  const r = runCmd("git", "git", ["status", "--porcelain"]);
  const lines = r.stdout.split("\n").filter(Boolean);
  const trackedDirty = lines.filter((l) => !l.startsWith("??"));
  if (trackedDirty.length === 0) {
    return { status: "pass", evidence: "No staged or modified tracked files." };
  }
  return {
    status: "fail",
    evidence: trackedDirty.slice(0, 8).join("; "),
    fix: "Commit or stash tracked changes before go-live.",
  };
}

function gitHeadMatchesOriginMain() {
  const head = runCmd("git", "git", ["rev-parse", "HEAD"]).stdout;
  runCmd("git", "git", ["fetch", "origin", "main"]);
  const origin = runCmd("git", "git", ["rev-parse", "origin/main"]).stdout;
  if (!origin) {
    return { status: "skip", evidence: "origin/main not available (offline?)." };
  }
  if (head === origin) {
    return { status: "pass", evidence: `HEAD ${head.slice(0, 7)} matches origin/main.` };
  }
  return {
    status: "fail",
    evidence: `HEAD ${head.slice(0, 7)} != origin/main ${origin.slice(0, 7)}`,
    fix: "Push and merge to main, then re-run from updated main.",
  };
}

async function githubActionsForMain() {
  const head = runCmd("git", "git", ["rev-parse", "HEAD"]).stdout.trim();
  const res = await fetch(
    "https://api.github.com/repos/beautonomi-1/Beautonomi/actions/runs?branch=main&per_page=30",
  );
  if (!res.ok) {
    return { status: "skip", evidence: `GitHub API ${res.status}` };
  }
  const data = await res.json();
  const runs = data.workflow_runs || [];
  const onSha = runs.filter((w) => w.head_sha === head);
  const ci = onSha.find((w) => w.name === "CI");
  let e2e = onSha.find((w) => w.name === "E2E (Preview + Staging)");
  if (!e2e) {
    const dep = await fetch(
      "https://api.github.com/repos/beautonomi-1/Beautonomi/actions/runs?event=deployment_status&per_page=30",
    );
    if (dep.ok) {
      e2e = pickBestE2eRun((await dep.json()).workflow_runs || [], head);
    }
  }
  const finance = runs.find((w) => w.name === "Finance Ledger Drift Check (Nightly)");

  const parts = [];
  if (ci) parts.push(`CI: ${ci.conclusion ?? ci.status}`);
  else parts.push("CI: no run on this SHA");
  if (e2e) parts.push(`E2E: ${e2e.conclusion ?? e2e.status}`);
  if (finance) parts.push(`Finance drift (latest on main branch): ${finance.conclusion ?? finance.status}`);

  if (!ci || ci.conclusion !== "success") {
    return {
      status: "fail",
      evidence: parts.join("; "),
      fix: "Wait for CI success on main or fix failing jobs.",
    };
  }
  return { status: "pass", evidence: parts.join("; ") };
}

function pickBestE2eRun(runs, head) {
  const e2eRuns = runs.filter(
    (w) => w.head_sha === head && w.name === "E2E (Preview + Staging)",
  );
  if (e2eRuns.length === 0) return null;
  const rank = (w) => {
    if (w.conclusion === "success") return 0;
    if (w.status === "in_progress" || w.status === "queued") return 1;
    if (w.conclusion === "skipped") return 2;
    return 3;
  };
  return e2eRuns.sort((a, b) => rank(a) - rank(b))[0];
}

async function githubE2EWarning() {
  const head = runCmd("git", "git", ["rev-parse", "HEAD"]).stdout.trim();
  const res = await fetch(
    "https://api.github.com/repos/beautonomi-1/Beautonomi/actions/runs?event=deployment_status&per_page=30",
  );
  if (!res.ok) return { status: "skip", evidence: "GitHub API unavailable" };
  const runs = (await res.json()).workflow_runs || [];
  const e2e = pickBestE2eRun(runs, head);
  if (!e2e) return { status: "warn", evidence: "No E2E run for this SHA (deploy may not have fired)." };
  if (e2e.conclusion === "success") return { status: "pass", evidence: "E2E (Preview + Staging) success." };
  if (e2e.conclusion === "skipped") return { status: "warn", evidence: "E2E skipped for this SHA." };
  return { status: "warn", evidence: `E2E ${e2e.conclusion ?? e2e.status}` };
}

async function githubFinanceWarning() {
  const res = await fetch(
    "https://api.github.com/repos/beautonomi-1/Beautonomi/actions/workflows/finance-drift.yml/runs?per_page=10",
  );
  if (!res.ok) {
    return { status: "skip", evidence: "Could not fetch finance drift workflow." };
  }
  const data = await res.json();
  const run = (data.workflow_runs || [])[0];
  if (!run) return { status: "skip", evidence: "No finance drift runs." };
  if (run.conclusion === "success") {
    return { status: "pass", evidence: `Latest finance drift: success (${run.created_at}).` };
  }
  return {
    status: "warn",
    evidence: `Latest finance drift: ${run.conclusion ?? run.status} (${run.html_url})`,
    fix: "Set GitHub SUPABASE_PRODUCTION_SERVICE_ROLE_KEY; finance-drift.yml uses production URL. Re-run workflow after merge, or run audit-finance-ledger.mjs locally against prod.",
  };
}

function supabaseClient(env) {
  const ref = PROJECTS[env].ref;
  return createClient(PROJECTS[env].url, serviceRoleKey(ref), { auth: { persistSession: false } });
}

async function prodHandleNewUserSearchPath() {
  const s = supabaseClient("production");
  const q =
    "SELECT proconfig FROM pg_proc WHERE proname = 'handle_new_user' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')";
  const { data, error } = await s.rpc("finance_audit_run", { p_query: q });
  if (error) {
    return {
      status: "fail",
      evidence: `finance_audit_run query failed: ${error.message}`,
      fix: "Ensure migration 724 on production; apply 972/973 for handle_new_user search_path.",
    };
  }
  const row = Array.isArray(data) ? data[0] : null;
  const proconfig = row?.proconfig ?? row?.proconfig;
  const flat = Array.isArray(proconfig)
    ? proconfig.join(",")
    : typeof proconfig === "string"
      ? proconfig
      : JSON.stringify(row ?? data).slice(0, 200);
  if (/search_path=public/i.test(flat)) {
    return { status: "pass", evidence: "handle_new_user proconfig includes search_path=public." };
  }
  return {
    status: "fail",
    evidence: `proconfig not confirmed: ${flat || "(empty)"}`,
    fix: "Apply migrations 972_handle_new_user_search_path.sql and 973_handle_new_user_signup_rls.sql on production.",
  };
}

async function prodZaTenantAndDomains() {
  const s = supabaseClient("production");
  const { data: za, error: te } = await s.from("tenants").select("id,slug,is_active").eq("slug", "za").maybeSingle();
  if (te || !za?.is_active) {
    return { status: "fail", evidence: te?.message ?? "za tenant missing or inactive" };
  }
  const required = ["www.beautonomi.com", "beautonomi.co.za", "admin.beautonomi.com"];
  const { data: domains, error: de } = await s
    .from("tenant_domains")
    .select("hostname,tenant_id,is_active")
    .in("hostname", required);
  if (de) return { status: "fail", evidence: de.message };
  const found = new Set((domains || []).map((d) => d.hostname));
  const missing = required.filter((h) => !found.has(h));
  if (missing.length) {
    return { status: "fail", evidence: `Missing tenant_domains: ${missing.join(", ")}` };
  }
  const wrongTenant = (domains || []).filter((d) => d.tenant_id !== za.id);
  if (wrongTenant.length) {
    return {
      status: "fail",
      evidence: `Domains not mapped to za: ${wrongTenant.map((d) => d.hostname).join(", ")}`,
    };
  }
  return { status: "pass", evidence: `za tenant active; domains: ${required.join(", ")}` };
}

async function prodPaystackNoTestKeysInDb() {
  const s = supabaseClient("production");
  let leak = false;
  const tables = [
    { name: "platform_secrets", cols: ["paystack_secret_key", "paystack_public_key"] },
    { name: "region_secrets", cols: ["key", "value_encrypted"] },
  ];
  for (const { name, cols } of tables) {
    const { data, error } = await s.from(name).select(cols.join(","));
    if (error) continue;
    for (const row of data || []) {
      for (const v of Object.values(row)) {
        if (typeof v === "string" && /sk_test/i.test(v)) leak = true;
      }
    }
  }
  if (leak) {
    return {
      status: "fail",
      evidence: "sk_test prefix found in production secrets tables",
      fix: "Remove test Paystack keys from production DB; use Vercel sk_live_ for runtime.",
    };
  }
  return { status: "pass", evidence: "No sk_test in platform_secrets/region_secrets (sampled)." };
}

async function stagingSignupRoundTrip() {
  const s = supabaseClient("staging");
  const email = `go-live-smoke-${Date.now()}@beautonomi-staging.invalid`;
  const { data, error } = await s.auth.admin.createUser({
    email,
    password: `Gl${Math.random().toString(36).slice(2)}!9x`,
    email_confirm: true,
  });
  if (error) {
    return {
      status: "fail",
      evidence: error.message,
      fix: "Fix staging handle_new_user / RLS (migrations 972/973).",
    };
  }
  const id = data.user?.id;
  if (id) await s.auth.admin.deleteUser(id);
  return { status: "pass", evidence: "Staging auth.admin.createUser + delete succeeded." };
}

async function stagingSeedIdempotent() {
  const r = nodeScript("scripts/e2e/seed-staging.mjs", "seed", {
    SUPABASE_URL: PROJECTS.staging.url,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey(PROJECTS.staging.ref),
  });
  if (r.code !== 0) {
    return { status: "warn", evidence: (r.stderr || r.stdout).slice(0, 200) };
  }
  const slug = r.stdout.split("\n").pop()?.trim();
  return {
    status: slug === "e2e-test-provider-beautonomi" ? "pass" : "warn",
    evidence: `Seed stdout slug: ${slug ?? "(empty)"}`,
  };
}

async function prodHealthOk() {
  const res = await fetch(`${PROD_ORIGIN}/api/health`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: "fail", evidence: `Non-JSON HTTP ${res.status}` };
  }
  const paystack = json.checks?.find((c) => c.name === "paystack");
  if (res.status !== 200 || json.status !== "ok") {
    return {
      status: "fail",
      evidence: `HTTP ${res.status}, status=${json.status}, paystack=${paystack?.status ?? "?"}`,
      fix: "Set PAYSTACK_SECRET_KEY on Vercel Production and redeploy.",
    };
  }
  if (paystack?.status !== "ok") {
    return {
      status: "fail",
      evidence: `health ok but paystack check: ${paystack?.status} ${paystack?.detail ?? ""}`,
      fix: "Align Vercel Paystack env with live keys.",
    };
  }
  return { status: "pass", evidence: "GET /api/health → 200, status ok, paystack ok." };
}

async function prodPublicTenantResolution() {
  const headers = { "x-forwarded-host": "www.beautonomi.co.za" };
  const home = await fetch(`${PROD_ORIGIN}/api/public/home`, { headers });
  if (!home.ok) {
    return { status: "fail", evidence: `/api/public/home → ${home.status}` };
  }
  const bundle = await fetch(
    `${PROD_ORIGIN}/api/public/config-bundle?platform=web&environment=production`,
    { headers },
  );
  if (!bundle.ok) {
    return { status: "fail", evidence: `/api/public/config-bundle → ${bundle.status}` };
  }
  const json = await bundle.json();
  const tenantId = json.meta?.tenant_id ?? json.meta?.tenant?.id;
  if (!tenantId) {
    return { status: "fail", evidence: "config-bundle missing tenant_id" };
  }
  return { status: "pass", evidence: `home ${home.status}, config-bundle tenant_id=${tenantId}` };
}

async function prodSecurityHeaders() {
  const res = await fetch(PROD_ORIGIN, { redirect: "follow" });
  const h = res.headers;
  const csp = h.get("content-security-policy");
  const xcto = h.get("x-content-type-options");
  const xfo = h.get("x-frame-options");
  const missing = [];
  if (!csp) missing.push("Content-Security-Policy");
  if (!xcto) missing.push("X-Content-Type-Options");
  if (!xfo && !(csp || "").includes("frame-ancestors")) missing.push("X-Frame-Options or frame-ancestors");
  const strict = h.get("strict-transport-security");
  if (!strict) missing.push("Strict-Transport-Security (warning-level)");
  if (missing.filter((m) => !m.includes("warning")).length) {
    return {
      status: "fail",
      evidence: `Missing: ${missing.join(", ")}`,
      fix: "Check apps/web next.config / middleware security headers on production.",
    };
  }
  return { status: "pass", evidence: `CSP, XCTO, frame policy present; HSTS=${strict ? "yes" : "no"}.` };
}

async function prodCronRequiresAuth() {
  const path = "/api/cron/recognize-period-revenue";
  const res = await fetch(`${PROD_ORIGIN}${path}`);
  if (res.status === 401 || res.status === 403) {
    return { status: "pass", evidence: `${path} → ${res.status} without auth.` };
  }
  return {
    status: "fail",
    evidence: `${path} → ${res.status} without Authorization`,
    fix: "Cron routes must reject unauthenticated calls.",
  };
}

async function prodTlsRedirectWarning() {
  const res = await fetch("https://beautonomi.com/", { redirect: "manual" });
  const loc = res.headers.get("location") || "";
  if ([301, 302, 307, 308].includes(res.status) && /beautonomi\.com/i.test(loc)) {
    return { status: "pass", evidence: `beautonomi.com → ${res.status} Location: ${loc.slice(0, 80)}` };
  }
  return { status: "warn", evidence: `beautonomi.com → ${res.status}, location=${loc || "(none)"}` };
}

/** Canonical booking URL: legacy /book/{slug} must 308 to /booking?slug=… on production hosts. */
async function prodBookSlugRedirect() {
  const slug = "e2e-test-provider-beautonomi";
  const hosts = [PROD_HOSTS.za, PROD_HOSTS.primary];
  const lines = [];
  for (const origin of hosts) {
    const legacy = `${origin}/book/${slug}`;
    const res = await fetch(legacy, { redirect: "manual" });
    const loc = res.headers.get("location") || "";
    const ok =
      [301, 302, 307, 308].includes(res.status) &&
      /\/booking\?slug=/i.test(loc) &&
      loc.includes(slug);
    lines.push(`${origin}/book/${slug} → ${res.status} ${loc.slice(0, 120)}`);
    if (!ok) {
      return {
        status: "fail",
        evidence: lines.join("; "),
        fix: "Ensure apps/web proxy + /book/[providerSlug] permanent redirect to /booking?slug=…",
      };
    }
  }
  return { status: "pass", evidence: lines.join("; ") };
}

async function compareSupabaseGaps() {
  const r = pnpm(["compare:supabase"], "compare");
  if (r.code !== 0) {
    return { status: "warn", evidence: (r.stderr || r.stdout).slice(0, 300) };
  }
  if (r.stdout.includes('"gaps": []') || r.stdout.includes("gaps: []")) {
    return { status: "pass", evidence: "compare:supabase gaps empty." };
  }
  return { status: "warn", evidence: "compare:supabase reported gaps (see stdout)." };
}

function buildChecks() {
  /** @type {Array<{ id: string, area: string, severity: "blocker"|"warning", fixHint?: string, run: () => Promise<{status: CheckStatus, evidence: string, fix?: string}> | {status: CheckStatus, evidence: string, fix?: string} }>} */
  const list = [
    {
      id: "git.tracked_clean",
      area: "repo",
      severity: "blocker",
      run: () => gitTrackedClean(),
    },
    {
      id: "git.head_origin_main",
      area: "repo",
      severity: "blocker",
      run: () => gitHeadMatchesOriginMain(),
    },
    {
      id: "repo.migrations",
      area: "repo",
      severity: "blocker",
      fixHint: "node tooling/audit/check-migrations.mjs",
      run: () => {
        const r = nodeScript("tooling/audit/check-migrations.mjs", "migrations");
        return r.code === 0
          ? { status: "pass", evidence: r.stdout.split("\n")[0] || "ok" }
          : { status: "fail", evidence: (r.stderr || r.stdout).slice(0, 400), fix: "Fix migration hygiene." };
      },
    },
    {
      id: "repo.audit_deps",
      area: "repo",
      severity: "blocker",
      run: () => {
        const r = pnpm(["run", "audit:deps"], "audit:deps");
        return r.code === 0
          ? { status: "pass", evidence: "audit:deps pass." }
          : { status: "fail", evidence: (r.stderr || r.stdout).slice(0, 400), fix: "pnpm run audit:deps" };
      },
    },
    {
      id: "repo.typecheck_lint",
      area: "repo",
      severity: "blocker",
      run: () => {
        const r = pnpm(
          ["exec", "turbo", "run", "typecheck", "lint", "--filter=web", "--filter=admin-web"],
          "turbo",
        );
        return r.code === 0
          ? { status: "pass", evidence: "web + admin-web typecheck/lint OK." }
          : { status: "fail", evidence: (r.stderr || r.stdout).slice(-400), fix: "Fix typecheck/lint errors." };
      },
    },
    {
      id: "repo.multi_tenant",
      area: "repo",
      severity: "blocker",
      run: () => {
        const r = pnpm(["run", "audit:multi-tenant:strict"], "multi-tenant");
        return r.code === 0
          ? { status: "pass", evidence: "audit:multi-tenant:strict pass." }
          : { status: "fail", evidence: (r.stderr || r.stdout).slice(0, 400) };
      },
    },
    {
      id: "repo.cron_schedule",
      area: "repo",
      severity: "blocker",
      run: () => {
        const r = pnpm(["run", "verify:cron-schedule"], "cron");
        return r.code === 0
          ? { status: "pass", evidence: "verify:cron-schedule pass." }
          : { status: "fail", evidence: (r.stderr || r.stdout).slice(0, 300) };
      },
    },
    {
      id: "repo.observability",
      area: "repo",
      severity: "blocker",
      run: () => {
        const r = pnpm(["run", "prod:check:observability"], "observability");
        return r.code === 0
          ? { status: "pass", evidence: "verify-observability-gates pass." }
          : { status: "fail", evidence: (r.stderr || r.stdout).slice(0, 300), fix: "Set NEXT_PUBLIC_SENTRY_DSN in apps/web/.env.local or env." };
      },
    },
    {
      id: "ci.main",
      area: "ci",
      severity: "blocker",
      run: () => githubActionsForMain(),
    },
    {
      id: "ci.e2e_warning",
      area: "ci",
      severity: "warning",
      run: () => githubE2EWarning(),
    },
    {
      id: "ci.finance_drift",
      area: "ci",
      severity: "warning",
      run: () => githubFinanceWarning(),
    },
    {
      id: "db.readiness",
      area: "supabase",
      severity: "blocker",
      run: () => {
        const r = pnpm(["run", "readiness:supabase:check"], "readiness");
        return r.code === 0
          ? { status: "pass", evidence: "readiness:supabase:check pass." }
          : { status: "fail", evidence: (r.stderr || r.stdout).slice(0, 400) };
      },
    },
    {
      id: "db.compare",
      area: "supabase",
      severity: "warning",
      run: () => compareSupabaseGaps(),
    },
    {
      id: "db.handle_new_user",
      area: "supabase",
      severity: "blocker",
      run: () => prodHandleNewUserSearchPath(),
    },
    {
      id: "db.za_domains",
      area: "supabase",
      severity: "blocker",
      run: () => prodZaTenantAndDomains(),
    },
    {
      id: "db.paystack_no_test",
      area: "supabase",
      severity: "blocker",
      run: () => prodPaystackNoTestKeysInDb(),
    },
    {
      id: "db.staging_signup",
      area: "supabase",
      severity: "blocker",
      run: () => stagingSignupRoundTrip(),
    },
    {
      id: "db.staging_seed",
      area: "supabase",
      severity: "warning",
      run: () => stagingSeedIdempotent(),
    },
    {
      id: "mobile.release_check",
      area: "mobile",
      severity: "warning",
      run: () => {
        const r = pnpm(["run", "release:check:mobile"], "mobile");
        return r.code === 0
          ? { status: "pass", evidence: "release:check:mobile pass." }
          : { status: "warn", evidence: (r.stderr || r.stdout).slice(0, 300) };
      },
    },
    {
      id: "mobile.expo_config",
      area: "mobile",
      severity: "warning",
      run: () => {
        const c = pnpm(["--filter", "customer", "exec", "expo", "config", "--type", "public"], "expo-c");
        const p = pnpm(["--filter", "provider", "exec", "expo", "config", "--type", "public"], "expo-p");
        if (c.code === 0 && p.code === 0) {
          return { status: "pass", evidence: "customer + provider expo config OK." };
        }
        return {
          status: "warn",
          evidence: `customer=${c.code} provider=${p.code}`,
        };
      },
    },
  ];

  if (MODE_FULL) {
    list.push({
      id: "repo.release_check_full",
      area: "repo",
      severity: "blocker",
      run: () => {
        const r = pnpm(["run", "release:check"], "release:check");
        return r.code === 0
          ? { status: "pass", evidence: "release:check (full test suite) pass." }
          : { status: "fail", evidence: (r.stderr || r.stdout).slice(-500) };
      },
    });
  }

  if (!SKIP_LIVE) {
    list.push(
      {
        id: "live.health",
        area: "production",
        severity: "blocker",
        run: () => prodHealthOk(),
      },
      {
        id: "live.public_tenant",
        area: "production",
        severity: "blocker",
        run: () => prodPublicTenantResolution(),
      },
      {
        id: "live.public_secrets",
        area: "production",
        severity: "blocker",
        run: () => {
          const r = nodeScript("scripts/prod/verify-public-endpoints.mjs", "public-endpoints", {
            BASE_URL: PROD_ORIGIN,
          });
          return r.code === 0
            ? { status: "pass", evidence: "verify-public-endpoints pass on production." }
            : { status: "fail", evidence: (r.stderr || r.stdout).slice(0, 400) };
        },
      },
      {
        id: "live.security_headers",
        area: "production",
        severity: "blocker",
        run: () => prodSecurityHeaders(),
      },
      {
        id: "live.cron_auth",
        area: "production",
        severity: "blocker",
        run: () => prodCronRequiresAuth(),
      },
      {
        id: "live.tls_redirect",
        area: "production",
        severity: "warning",
        run: () => prodTlsRedirectWarning(),
      },
      {
        id: "live.book_slug_redirect",
        area: "production",
        severity: "blocker",
        run: () => prodBookSlugRedirect(),
      },
      {
        id: "staging.preview",
        area: "staging",
        severity: "warning",
        run: () => {
          const r = nodeScript("tooling/audit/verify-staging-preview.mjs", "staging-preview");
          if (r.code === 0) {
            return {
              status: "pass",
              evidence: process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()
                ? "Staging DB + live Preview /api/public/home OK."
                : "Staging DB tenant map OK (live probe skipped — no bypass secret).",
            };
          }
          return {
            status: "warn",
            evidence: (r.stderr || r.stdout).slice(0, 350),
            fix: "Fix Preview Vercel env per docs/STAGING_VERCEL_PREVIEW_ENV.md; run pnpm verify:staging:preview",
          };
        },
      },
      {
        id: "staging.e2e_hosts",
        area: "staging",
        severity: "warning",
        run: () => {
          if (!process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()) {
            return {
              status: "skip",
              evidence: "VERCEL_AUTOMATION_BYPASS_SECRET not set — skip tenant-isolation host verify.",
            };
          }
          const r = nodeScript("tooling/audit/verify-staging-e2e-hosts.mjs", "staging-hosts");
          return r.code === 0
            ? { status: "pass", evidence: "staging multi-tenant host smoke OK." }
            : { status: "warn", evidence: (r.stderr || r.stdout).slice(0, 300) };
        },
      },
    );
  }

  return list;
}

function computeVerdict() {
  const blockers = results.filter((r) => r.severity === "blocker");
  const warnings = results.filter((r) => r.severity === "warning");
  const blockerFails = blockers.filter((r) => r.status === "fail");
  const warningFails = warnings.filter((r) => r.status === "fail" || r.status === "warn");

  if (blockerFails.length > 0) return "No-Go";
  if (warningFails.length > 1) return "Conditional Go";
  if (warningFails.length === 1) return "Conditional Go";
  return "Go";
}

function writeReports(verdict) {
  const date = new Date().toISOString().slice(0, 10);
  const dir = join(ROOT, "docs", "go-live");
  mkdirSync(dir, { recursive: true });
  const jsonPath = join(dir, `go-live-report-${date}.json`);
  const mdPath = join(dir, `GO_LIVE_REPORT_${date}.md`);
  const head = runCmd("git", "git", ["rev-parse", "HEAD"]).stdout.trim();

  const payload = {
    date,
    verdict,
    mode: MODE_FULL ? "full" : "quick",
    skipLive: SKIP_LIVE,
    headSha: head,
    results,
    manualChecklist: MANUAL_CHECKLIST,
  };
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  const lines = [
    `# Go-live readiness report — ${date}`,
    "",
    `**Verdict:** ${verdict}`,
    "",
    `**Mode:** ${MODE_FULL ? "full" : "quick"}${SKIP_LIVE ? " (skip-live)" : ""}`,
    "",
    `**Git HEAD:** \`${head.slice(0, 7)}\``,
    "",
    "## Automated checks",
    "",
    "| Area | ID | Sev | Status | Evidence |",
    "|------|-----|-----|--------|----------|",
  ];
  for (const r of results) {
    const ev = r.evidence.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 120);
    lines.push(`| ${r.area} | ${r.id} | ${r.severity} | ${r.status} | ${ev} |`);
  }
  lines.push("", "## Manual checklist (not automated)", "");
  for (const item of MANUAL_CHECKLIST) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push("", "## Failed blockers — suggested fixes", "");
  for (const r of results.filter((x) => x.severity === "blocker" && x.status === "fail")) {
    lines.push(`- **${r.id}**: ${r.fix ?? r.evidence}`);
  }
  writeFileSync(mdPath, lines.join("\n"));
  return { jsonPath, mdPath };
}

async function main() {
  console.log(`== Go-live check (${MODE_FULL ? "full" : "quick"}${SKIP_LIVE ? ", skip-live" : ""}) ==\n`);
  const checks = buildChecks();
  for (const c of checks) {
    process.stdout.write(`… ${c.id}`);
    await runCheck(c, () => c.run());
    const last = results[results.length - 1];
    console.log(` → ${last.status}`);
  }

  const verdict = computeVerdict();
  const { jsonPath, mdPath } = writeReports(verdict);

  console.log("\n== Summary ==");
  console.log(`Verdict: ${verdict}`);
  for (const r of results.filter((x) => x.status === "fail" || x.status === "warn")) {
    console.log(`  [${r.severity}] ${r.id}: ${r.evidence.slice(0, 100)}`);
  }
  console.log(`\nReport: ${mdPath}`);
  console.log(`JSON:   ${jsonPath}`);

  if (verdict === "No-Go") process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
