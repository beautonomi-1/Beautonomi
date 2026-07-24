#!/usr/bin/env node
/**
 * Finalize AUDIT-2026-07-22 registers after domain workstreams.
 * Run: node scripts/audit/finalize-go-live-rerun-2026-07-22.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const OUT = join(ROOT, "docs", "audit", "go-live-2026-07-22");
const PRIOR = join(ROOT, "docs", "audit", "go-live-2026-07");

function writeJson(name, data) {
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 2) + "\n", "utf8");
}

const priorScores = JSON.parse(readFileSync(join(PRIOR, "readiness-scores.json"), "utf8"));

const findings = [
  { id: "FND-P0-001", severity: "P1", prior_status: "mitigated", status: "mitigated", title: "CSRF uses CRON_SECRET fallback; dedicated CSRF_SECRET recommended", agent: 8, application: "APP-001", regression: false, resolution_evidence: ["EVD-001", "EVD-039"], go_live_impact: "high", confidence: "high" },
  { id: "FND-P0-002", severity: "P0", prior_status: "open", status: "partial", title: "E2E coverage critically thin for money paths", agent: 13, application: "APP-001", regression: false, resolution_evidence: ["EVD-002", "EVD-003", "EVD-040"], notes: "money-path.spec.ts added (3 E2E specs total); still no signed webhook/payout E2E", go_live_impact: "blocker", confidence: "high" },
  { id: "FND-P0-003", severity: "P0", prior_status: "open", status: "open", title: "Multi-market tenant isolation unverified at runtime", agent: 7, application: "APP-001", regression: false, resolution_evidence: ["EVD-004", "EVD-005", "EVD-041"], notes: "281 resolveTenantIdWithZaFallback call sites in 127 files", go_live_impact: "blocker", confidence: "medium" },
  { id: "FND-P0-004", severity: "P0", prior_status: "resolved", status: "resolved", title: "Search map displays fake coordinates", agent: 2, application: "APP-001", regression: false, resolution_evidence: ["EVD-006", "EVD-042"], notes: "Live path search-results.tsx uses real coords; orphan slider.tsx retains fake data (FND-P2-004)", go_live_impact: "none", confidence: "high" },
  { id: "FND-P0-005", severity: "P0", prior_status: "resolved", status: "resolved", title: "Shipping integration gated off (courier stubs remain)", agent: 10, application: "APP-001", regression: false, resolution_evidence: ["EVD-007", "EVD-043"], notes: "ECOMMERCE_SHIPPING_ENABLED gate returns skipped; couriers still throw if enabled", go_live_impact: "none", confidence: "high" },
  { id: "FND-P0-006", severity: "P0", prior_status: "resolved", status: "resolved", title: "POS creates unpersisted client IDs", agent: 4, application: "APP-001", regression: false, resolution_evidence: ["EVD-008"], go_live_impact: "none", confidence: "high" },
  { id: "FND-P0-007", severity: "P0", prior_status: "resolved", status: "resolved", title: "Time-clock returns fake success on missing tables", agent: 4, application: "APP-001", regression: false, resolution_evidence: ["EVD-009"], go_live_impact: "none", confidence: "high" },
  { id: "FND-P1-001", severity: "P1", prior_status: "mitigated", status: "mitigated", title: "PayCloud same-terminal incomplete", agent: 10, application: "APP-004", regression: false, resolution_evidence: ["EVD-010"], go_live_impact: "high", confidence: "high" },
  { id: "FND-P1-002", severity: "P1", prior_status: "resolved", status: "open", title: "Advanced search filters no-op", agent: 2, application: "APP-001", regression: true, resolution_evidence: ["EVD-011", "EVD-044"], notes: "REGRESSION: availability/price filters still no-op in advanced/route.ts:104-108", go_live_impact: "high", confidence: "high" },
  { id: "FND-P1-003", severity: "P1", prior_status: "open", status: "open", title: "ZA postal areas placeholder seed only", agent: 11, application: "APP-001", regression: false, resolution_evidence: ["EVD-012"], go_live_impact: "high", confidence: "high" },
  { id: "FND-P1-004", severity: "P1", prior_status: "open", status: "open", title: "KYB verification flags off by default", agent: 4, application: "APP-001", regression: false, resolution_evidence: ["EVD-013"], go_live_impact: "high", confidence: "high" },
  { id: "FND-P1-005", severity: "P1", prior_status: "partial", status: "partial", title: "Rate limiting in-memory fallback on multi-instance", agent: 8, application: "APP-001", regression: false, resolution_evidence: ["EVD-014"], go_live_impact: "high", confidence: "high" },
  { id: "FND-P1-006", severity: "P1", prior_status: "partial", status: "partial", title: "CSP allows unsafe-inline and unsafe-eval", agent: 8, application: "APP-001", regression: false, resolution_evidence: ["EVD-015"], go_live_impact: "medium", confidence: "high" },
  { id: "FND-P1-007", severity: "P1", prior_status: "resolved", status: "resolved", title: "Stripe and Flutterwave appear but not implemented", agent: 10, application: "APP-002", regression: false, resolution_evidence: ["EVD-016", "EVD-045"], notes: "Stripe processor now implemented for bookings; Flutterwave still enum-only", go_live_impact: "medium", confidence: "high" },
  { id: "FND-P1-008", severity: "P1", prior_status: "open", status: "open", title: "7-day staging drift gate unsigned", agent: 15, application: "APP-001", regression: false, resolution_evidence: ["EVD-017"], go_live_impact: "high", confidence: "high" },
  { id: "FND-P1-009", severity: "P1", prior_status: "open", status: "open", title: "Game-day drills documented but unverified", agent: 16, application: "APP-001", regression: false, resolution_evidence: ["EVD-018"], go_live_impact: "high", confidence: "high" },
  { id: "FND-P1-010", severity: "P1", prior_status: "resolved", status: "resolved", title: "Custom offer image upload not implemented", agent: 2, application: "APP-001", regression: false, resolution_evidence: ["EVD-019"], notes: "Web resolved; mobile parity gap FND-P2-007", go_live_impact: "medium", confidence: "high" },
  { id: "FND-P1-011", severity: "P1", prior_status: "resolved", status: "resolved", title: "Admin SPA HTML served without edge role gate", agent: 7, application: "APP-002", regression: false, resolution_evidence: ["EVD-020"], go_live_impact: "medium", confidence: "high" },
  { id: "FND-P1-012", severity: "P1", prior_status: "open", status: "open", title: "API authorization relies on service-role bypass", agent: 7, application: "APP-001", regression: false, resolution_evidence: ["EVD-021", "EVD-046"], notes: "710/1282 API routes use getSupabaseAdmin", go_live_impact: "high", confidence: "high" },
  { id: "FND-P1-013", severity: "P1", prior_status: "resolved", status: "resolved", title: "QR scanner manual input only", agent: 4, application: "APP-001", regression: false, resolution_evidence: ["EVD-022"], go_live_impact: "medium", confidence: "high" },
  { id: "FND-P1-014", severity: "P1", prior_status: "resolved", status: "resolved", title: "Service zone analytics ignores polygon/radius zones", agent: 4, application: "APP-001", regression: false, resolution_evidence: ["EVD-023"], go_live_impact: "medium", confidence: "high" },
  { id: "FND-P1-015", severity: "P1", prior_status: "resolved", status: "resolved", title: "LAUNCH_READINESS_100 contradicts discovered gaps", agent: 19, application: "APP-001", regression: false, resolution_evidence: ["EVD-017"], go_live_impact: "high", confidence: "high" },
  { id: "FND-P1-016", severity: "P1", prior_status: "partial", status: "partial", title: "Backup restore not verified", agent: 15, application: "APP-001", regression: false, resolution_evidence: ["EVD-024"], go_live_impact: "high", confidence: "medium" },
  { id: "FND-P1-017", severity: "P1", prior_status: "open", status: "partial", title: "Legal documents not verifiable in repository", agent: 17, application: "APP-001", regression: false, resolution_evidence: ["EVD-025", "EVD-047"], notes: "Migration 780 seeds CMS legal pages; counsel sign-off still required", go_live_impact: "high", confidence: "medium" },
  { id: "FND-P1-018", severity: "P1", prior_status: "resolved", status: "resolved", title: "Web typecheck failure blocks release:check", agent: 15, application: "APP-001", regression: false, resolution_evidence: ["EVD-036", "EVD-048"], notes: "tsc --noEmit passes 2026-07-22", go_live_impact: "none", confidence: "high" },
  { id: "FND-P1-019", severity: "P1", prior_status: "resolved", status: "resolved", title: "Provider API routes missing tenant guard heuristic", agent: 7, application: "APP-001", regression: false, resolution_evidence: ["EVD-037", "EVD-049"], notes: "check-provider-tenant-guards.mjs status ok count 0", go_live_impact: "none", confidence: "high" },
  { id: "FND-P1-020", severity: "P1", prior_status: "partial", status: "partial", title: "Production config-bundle exposes test Paystack key", agent: 8, application: "APP-001", regression: false, resolution_evidence: ["EVD-038"], notes: "Cannot verify DB value locally; no code guard rejecting pk_test_", go_live_impact: "high", confidence: "medium" },
  { id: "FND-P1-021", severity: "P1", prior_status: null, status: "open", title: "Stripe webhook ignores non-booking PaymentIntents", agent: 9, application: "APP-001", regression: false, resolution_evidence: ["EVD-050"], go_live_impact: "high", confidence: "high" },
  { id: "FND-P1-022", severity: "P1", prior_status: null, status: "open", title: "Stripe alternate settlement models unimplemented", agent: 9, application: "APP-001", regression: false, resolution_evidence: ["EVD-051"], go_live_impact: "high", confidence: "high" },
  { id: "FND-P1-023", severity: "P1", prior_status: null, status: "open", title: "Admin payout transfer path is Paystack-only", agent: 9, application: "APP-002", regression: false, resolution_evidence: ["EVD-052"], go_live_impact: "high", confidence: "high" },
  { id: "FND-P1-024", severity: "P1", prior_status: null, status: "open", title: "Payment webhooks under /api/payments/* may fail CSRF check", agent: 8, application: "APP-001", regression: false, resolution_evidence: ["EVD-053"], notes: "proxy.ts exempts /api/webhooks/ only; canonical Paystack/Stripe webhooks live under /api/payments/", go_live_impact: "high", confidence: "medium" },
  { id: "FND-P2-001", severity: "P2", prior_status: "resolved", status: "resolved", title: "provider_onboarding role not in PG enum", agent: 7, application: "APP-001", regression: false, resolution_evidence: ["EVD-026"], go_live_impact: "low", confidence: "high" },
  { id: "FND-P2-002", severity: "P2", prior_status: "resolved", status: "resolved", title: "Hardcoded category fallback on mobile", agent: 3, application: "APP-003", regression: false, resolution_evidence: ["EVD-027"], go_live_impact: "low", confidence: "high" },
  { id: "FND-P2-003", severity: "P2", prior_status: "partial", status: "partial", title: "No recent load test results in repository", agent: 14, application: "APP-001", regression: false, resolution_evidence: ["EVD-028"], go_live_impact: "medium", confidence: "high" },
  { id: "FND-P2-004", severity: "P2", prior_status: null, status: "open", title: "Orphan search slider.tsx retains fake London map pins", agent: 18, application: "APP-001", regression: false, resolution_evidence: ["EVD-054"], go_live_impact: "low", confidence: "high" },
  { id: "FND-P2-005", severity: "P2", prior_status: null, status: "open", title: "audit-finance-ledger.mjs silently skips on missing RPC", agent: 9, application: "APP-001", regression: false, resolution_evidence: ["EVD-055"], go_live_impact: "medium", confidence: "high" },
  { id: "FND-P2-006", severity: "P2", prior_status: null, status: "open", title: "Integration register stale for Stripe (was mock)", agent: 10, application: "APP-001", regression: false, resolution_evidence: ["EVD-045"], go_live_impact: "low", confidence: "high" },
  { id: "FND-P2-007", severity: "P2", prior_status: null, status: "open", title: "Custom offer image upload missing on provider mobile", agent: 5, application: "APP-004", regression: false, resolution_evidence: ["EVD-056"], go_live_impact: "medium", confidence: "high" },
  { id: "FND-P2-008", severity: "P2", prior_status: null, status: "open", title: "Membership subscribers UI mobile-only (no provider web page)", agent: 4, application: "APP-004", regression: false, resolution_evidence: ["EVD-057"], go_live_impact: "medium", confidence: "high" },
  { id: "FND-P2-009", severity: "P2", prior_status: null, status: "open", title: "Agent tool support.classifyTicket registered but not bound in production", agent: 18, application: "APP-001", regression: false, resolution_evidence: ["EVD-058"], go_live_impact: "low", confidence: "high" },
  { id: "FND-P2-010", severity: "P2", prior_status: null, status: "open", title: "Fraud cases absent from admin API inventory and criticalFlows", agent: 6, application: "APP-002", regression: false, resolution_evidence: ["EVD-059"], go_live_impact: "medium", confidence: "high" },
  { id: "FND-P2-011", severity: "P2", prior_status: null, status: "open", title: "Mobile parity contract misroutes onboarding screen", agent: 3, application: "APP-003", regression: false, resolution_evidence: ["EVD-060"], go_live_impact: "low", confidence: "high" },
  { id: "FND-P3-001", severity: "P3", prior_status: "resolved", status: "resolved", title: "Support ticket labels mention Stripe for payouts", agent: 18, application: "APP-002", regression: false, resolution_evidence: ["EVD-029"], go_live_impact: "none", confidence: "high" },
];

const p0open = findings.filter((f) => f.severity === "P0" && ["open", "partial"].includes(f.status)).length;
const p1open = findings.filter((f) => f.severity === "P1" && ["open", "partial"].includes(f.status)).length;
const p2open = findings.filter((f) => f.severity === "P2" && ["open", "partial"].includes(f.status)).length;
const p3open = findings.filter((f) => f.severity === "P3" && ["open", "partial"].includes(f.status)).length;
const regressions = findings.filter((f) => f.regression).map((f) => f.id);

const domains = [
  { domain: "core_business_functionality", weight: 0.18, score: 78, challenger_adjustment: -2, agent: 2, confidence: "medium" },
  { domain: "customer_web", weight: 0.07, score: 81, challenger_adjustment: -2, agent: 2, confidence: "medium" },
  { domain: "customer_mobile", weight: 0.05, score: 78, challenger_adjustment: 0, agent: 3, confidence: "medium" },
  { domain: "provider_web", weight: 0.07, score: 74, challenger_adjustment: -2, agent: 4, confidence: "medium" },
  { domain: "provider_mobile", weight: 0.05, score: 72, challenger_adjustment: 0, agent: 5, confidence: "medium" },
  { domain: "superadmin_operations", weight: 0.1, score: 79, challenger_adjustment: 0, agent: 6, confidence: "medium" },
  { domain: "security_identity_privacy", weight: 0.12, score: 67, challenger_adjustment: -3, agent: 7, confidence: "low" },
  { domain: "payments_financial_integrity", weight: 0.08, score: 78, challenger_adjustment: -2, agent: 9, confidence: "medium" },
  { domain: "data_reporting_integrations", weight: 0.08, score: 74, challenger_adjustment: 0, agent: 10, confidence: "medium" },
  { domain: "quality_assurance_testing", weight: 0.06, score: 58, challenger_adjustment: -2, agent: 13, confidence: "high" },
  { domain: "infrastructure_devops", weight: 0.05, score: 80, challenger_adjustment: 0, agent: 15, confidence: "medium" },
  { domain: "performance_reliability", weight: 0.03, score: 63, challenger_adjustment: 0, agent: 14, confidence: "low" },
  { domain: "ux_accessibility", weight: 0.03, score: 67, challenger_adjustment: 0, agent: 12, confidence: "low" },
  { domain: "operational_readiness", weight: 0.02, score: 68, challenger_adjustment: 0, agent: 16, confidence: "low" },
  { domain: "legal_regulatory", weight: 0.01, score: 72, challenger_adjustment: 0, agent: 17, confidence: "medium" },
];

let weighted = 0;
for (const d of domains) {
  d.final_score = Math.max(0, d.score + d.challenger_adjustment);
  d.weighted_score = Math.round(d.final_score * d.weight * 100) / 100;
  weighted += d.weighted_score;
}

const readiness = {
  audit_id: "AUDIT-2026-07-22",
  prior_audit_id: "AUDIT-2026-07-11",
  generated_at: new Date().toISOString(),
  evidence_mode: "local_static_and_tests",
  challenger_reviewed: true,
  overall_readiness_percent: Math.round(weighted),
  prior_overall_readiness_percent: priorScores.overall_readiness_percent,
  score_change: Math.round(weighted) - priorScores.overall_readiness_percent,
  overall_confidence: "medium",
  p0_count: p0open,
  p1_count: p1open,
  p2_count: p2open,
  p3_count: p3open,
  has_unresolved_p0: p0open > 0,
  recommendation: p0open > 0 ? "no_go_pending_critical_remediation" : "controlled_pilot",
  pilot_recommendation: "single_tenant_za_web_first_after_p0_staging_verification",
  domains,
  application_scores: {
    APP_001: 78,
    APP_002: 79,
    APP_003: 78,
    APP_004: 72,
  },
  prior_application_scores: priorScores.application_scores,
};

writeJson("findings-register.json", {
  audit_id: "AUDIT-2026-07-22",
  prior_audit_id: "AUDIT-2026-07-11",
  generated_at: new Date().toISOString(),
  findings,
  summary: {
    total: findings.length,
    P0_open: p0open,
    P1_open: p1open,
    P2_open: p2open,
    P3_open: p3open,
    regressions,
    new_findings: findings.filter((f) => f.prior_status === null).map((f) => f.id),
    resolved_since_prior: findings.filter((f) => f.prior_status && f.prior_status !== "resolved" && f.status === "resolved").map((f) => f.id),
  },
});

writeJson("readiness-scores.json", readiness);

writeJson("rerun-comparison.json", {
  audit_id: "AUDIT-2026-07-22",
  prior_audit_id: "AUDIT-2026-07-11",
  generated_at: new Date().toISOString(),
  overall: {
    previous: priorScores.overall_readiness_percent,
    current: readiness.overall_readiness_percent,
    change: readiness.score_change,
  },
  domain_changes: domains.map((d) => {
    const prior = priorScores.domains.find((p) => p.domain === d.domain);
    return {
      domain: d.domain,
      previous_final: prior?.final_score ?? null,
      current_final: d.final_score,
      change: prior ? d.final_score - prior.final_score : null,
    };
  }),
  blockers: {
    p0_closed: ["FND-P0-004", "FND-P0-005", "FND-P0-006", "FND-P0-007"],
    p0_still_open: ["FND-P0-002", "FND-P0-003"],
    p0_reopened: [],
    p1_regressions: regressions,
    new_p1: ["FND-P1-021", "FND-P1-022", "FND-P1-023", "FND-P1-024"],
    new_p2_count: 8,
  },
  platform_delta: {
    api_routes: { previous: 1143, current: 1282 },
    migrations: { previous: 662, current: 818 },
    packages: { previous: 12, current: 20 },
    test_files: { previous: 565, current: 934 },
    e2e_specs: { previous: 2, current: 3 },
  },
  journeys_cannot_verify: 11,
  evidence_limitation: "No staging/production credentials; 11 journeys remain cannot_verify",
});

writeJson("challenger-report.json", {
  audit_id: "AUDIT-2026-07-22",
  agent: 19,
  generated_at: new Date().toISOString(),
  challenged_score_increase: true,
  rejected_findings: [
    { id: "FND-P1-002-resolved-claim", reason: "advanced/route.ts:104-108 still no-op; prior resolved status incorrect" },
    { id: "post-remediation-84pct-claim", reason: "Cannot reach 84% with 2 open P0s and local-only evidence cap" },
  ],
  reclassified_findings: [
    { id: "FND-P0-002", from: "open", to: "partial", reason: "money-path.spec.ts adds API smoke but not full money E2E" },
    { id: "FND-P1-017", from: "open", to: "partial", reason: "migration 780 provides repo evidence for legal CMS content" },
    { id: "INT-011", from: "mock", to: "partial", reason: "Stripe booking processor shipped; Connect lifecycle incomplete" },
  ],
  additional_blockers: ["FND-P1-024", "FND-P1-002-regression"],
  confidence_adjusted_recommendation: "no_go_pending_critical_remediation",
  confidence: "high",
  notes: "Score capped at 74% despite net-new features (Stripe, fraud, agent workforce) because unresolved P0s and staging-gated journeys override numeric readiness.",
});

writeJson("audit-run-results.json", {
  audit_id: "AUDIT-2026-07-22",
  generated_at: new Date().toISOString(),
  commands: [
    { command: "node .tmp/generate-go-live-audit-rerun.mjs", status: "pass", notes: "Baseline registers generated" },
    { command: "pnpm audit:routes", status: "pass", notes: "1647 web entries" },
    { command: "pnpm parity:check", status: "pass", notes: "32/32 customer contract screens" },
    { command: "pnpm audit:multi-tenant", status: "partial", notes: "16 admin routes flagged for tenant scope review" },
    { command: "node scripts/audit/check-provider-tenant-guards.mjs", status: "pass", notes: "count 0" },
    { command: "node scripts/prod/readiness-check.mjs --skip-runtime", status: "fail", notes: "exit 1 — lint failures on at least one app (web lint warnings)" },
    { command: "pnpm --filter web typecheck", status: "pass" },
    { command: "pnpm --filter customer test", status: "pass", notes: "216 tests" },
    { command: "pnpm --filter provider test", status: "pass", notes: "357 tests" },
    { command: "pnpm --filter admin-web test", status: "pass", notes: "256 tests" },
    { command: "pnpm --filter web test", status: "pending", notes: "vitest run in progress during audit finalization" },
  ],
  unit_test_totals: {
    customer: 216,
    provider: 357,
    admin_web: 256,
    web: "pending",
    e2e_playwright: 3,
  },
});

writeJson("integration-register.json", {
  audit_id: "AUDIT-2026-07-22",
  integrations: [
    { id: "INT-001", name: "Paystack", status: "full", change_since_prior: "unchanged", monitoring: true, reconciliation: true },
    { id: "INT-002", name: "PayCloud", status: "partial", change_since_prior: "unchanged", gap: "same-terminal gated off" },
    { id: "INT-003", name: "Yoco", status: "full", change_since_prior: "unchanged" },
    { id: "INT-004", name: "Didit", status: "full", change_since_prior: "unchanged" },
    { id: "INT-005", name: "Wasender", status: "full", change_since_prior: "unchanged" },
    { id: "INT-006", name: "Amplitude", status: "full", change_since_prior: "unchanged" },
    { id: "INT-007", name: "Gemini", status: "full", change_since_prior: "control-plane IA expanded" },
    { id: "INT-008", name: "Aura", status: "partial", change_since_prior: "unchanged" },
    { id: "INT-009", name: "OneSignal", status: "full", change_since_prior: "unchanged" },
    { id: "INT-010", name: "Mapbox", status: "full", change_since_prior: "unchanged" },
    { id: "INT-011", name: "Stripe", status: "partial", change_since_prior: "mock→partial", gap: "booking destination charges only; no Connect account.updated webhook" },
    { id: "INT-012", name: "Flutterwave", status: "mock", change_since_prior: "unchanged" },
    { id: "INT-013", name: "Aramex/BobGo/CourierGuy", status: "stub", change_since_prior: "gated off at app layer" },
    { id: "INT-014", name: "Slack", status: "full", change_since_prior: "safety panic alerts added" },
    { id: "INT-015", name: "Twilio", status: "full", change_since_prior: "voice dialer for provider-ops leads" },
    { id: "INT-016", name: "Salestrail", status: "partial", change_since_prior: "new", gap: "webhook route present; ops reconciliation unverified locally" },
    { id: "INT-017", name: "Agent workforce (internal)", status: "partial", change_since_prior: "new", gap: "proposal-only crons; support.classifyTicket unbound" },
  ],
});

writeJson("test-register.json", {
  audit_id: "AUDIT-2026-07-22",
  generated_at: new Date().toISOString(),
  test_file_count: 934,
  critical_journey_coverage: [
    { journey: "JRN-004", risk: "P0", coverage: "partial", tests: ["apps/web/e2e/money-path.spec.ts", "payment webhook unit tests"], gap: "no signed webhook E2E" },
    { journey: "JRN-026", risk: "P0", coverage: "partial", tests: ["route.post-rpc.test.ts", "available-payout-balance.test.ts"], gap: "no initiate-transfer E2E" },
    { journey: "JRN-052", risk: "P0", coverage: "partial", tests: ["isolation-runtime.test.ts (mocked)"], gap: "no live cross-tenant test" },
  ],
  e2e_specs: [
    "apps/web/e2e/booking-happy-path.spec.ts",
    "apps/web/e2e/money-path.spec.ts",
    "apps/admin-web/e2e/login-shell.spec.ts",
  ],
  unit_suites_verified: {
    customer: { suites: 32, tests: 216, status: "pass" },
    provider: { suites: 72, tests: 357, status: "pass" },
    admin_web: { suites: 18, tests: 256, status: "pass" },
    web: { status: "pending", notes: "vitest run during audit" },
  },
  release_quality_score: 58,
  confidence: "high",
});

writeJson("capability-register.json", {
  audit_id: "AUDIT-2026-07-22",
  capabilities: [
    { id: "CAP-BOOK-001", name: "Public booking checkout", status: "full", change: "unchanged" },
    { id: "CAP-PAY-001", name: "Paystack online payments", status: "full", change: "runtime unverified" },
    { id: "CAP-PAY-004", name: "Stripe Connect booking payments", status: "partial", change: "new", gap: "non-booking PI unhandled" },
    { id: "CAP-PAY-002", name: "PayCloud terminal payments", status: "partial", change: "unchanged" },
    { id: "CAP-PAYOUT-001", name: "Provider payout requests", status: "full", change: "transfer E2E unverified" },
    { id: "CAP-KYC-001", name: "Didit identity verification", status: "full", change: "unchanged" },
    { id: "CAP-KYB-001", name: "Provider KYB verification", status: "partial", gap: "flags off by default" },
    { id: "CAP-SEARCH-001", name: "Provider search", status: "partial", gap: "advanced filters no-op (regression)" },
    { id: "CAP-ECOM-001", name: "Product shipping", status: "gated", gap: "ECOMMERCE_SHIPPING_ENABLED gate" },
    { id: "CAP-ADMIN-001", name: "Superadmin portal", status: "full", change: "fraud cases + voice dialer added" },
    { id: "CAP-FRAUD-001", name: "Fraud case management", status: "full", change: "new" },
    { id: "CAP-AGENT-001", name: "Agent workforce copilot", status: "partial", change: "new", gap: "unbound classifyTicket tool" },
    { id: "CAP-TENANT-001", name: "Multi-tenant isolation", status: "partial", gap: "runtime unverified" },
    { id: "CAP-TERMINAL-001", name: "Terminal shop B2B", status: "full", change: "new since prior audit" },
    { id: "CAP-MEMBERSHIP-001", name: "Membership billing", status: "full", change: "renewal cron + webhook tests added" },
  ],
});

console.log(`Finalized AUDIT-2026-07-22 registers in ${OUT}`);
console.log(`Overall readiness: ${readiness.overall_readiness_percent}% (prior ${priorScores.overall_readiness_percent}%)`);
console.log(`P0 open: ${p0open}, P1 open: ${p1open}, regressions: ${regressions.join(", ") || "none"}`);
