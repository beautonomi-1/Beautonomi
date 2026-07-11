#!/usr/bin/env node
/**
 * Generate go-live audit JSON registers from repository evidence.
 * Run from repo root: node scripts/audit/generate-go-live-audit.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const OUT = join(ROOT, "docs", "audit", "go-live-2026-07");

function walk(dir, filter) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full, filter));
    else if (!filter || filter(full)) results.push(full);
  }
  return results;
}

function countApiRoutes() {
  const apiDir = join(ROOT, "apps", "web", "src", "app", "api");
  return walk(apiDir, (f) => f.endsWith("route.ts")).length;
}

function countMigrations() {
  const migDir = join(ROOT, "supabase", "migrations");
  return walk(migDir, (f) => f.endsWith(".sql")).length;
}

function countTests() {
  return walk(ROOT, (f) => /\.(test|spec)\.(ts|tsx|js)$/.test(f)).length;
}

function scanApiGuards() {
  const apiDir = join(ROOT, "apps", "web", "src", "app", "api");
  const routes = walk(apiDir, (f) => f.endsWith("route.ts"));
  const buckets = { admin: [], provider: [], me: [], public: [], cron: [], other: [] };
  for (const route of routes) {
    const rel = relative(apiDir, route).replace(/\\/g, "/");
    const content = readFileSync(route, "utf8");
    const hasRequireRole = /requireRoleInApi|requireAdminSection|requireAuthInApi/.test(content);
    const hasGetProviderId =
      /getProviderIdForUser/.test(content) ||
      /userHasProviderAccessAdmin/.test(content) ||
      /requireProviderSupportTicketAccess/.test(content) ||
      /resourceTenantMatchesHostTenant/.test(content) ||
      /\.from\s*\(\s*["']providers["']\s*\)[\s\S]{0,500}?\.eq\s*\(\s*["']user_id["']\s*,\s*user\.id/.test(content);
    const isCron = rel.startsWith("cron/");
    const isPublic = rel.startsWith("public/");
    const isAdmin = rel.startsWith("admin/");
    const isProvider = rel.startsWith("provider/");
    const isMe = rel.startsWith("me/");
    const bucket = isCron ? "cron" : isPublic ? "public" : isAdmin ? "admin" : isProvider ? "provider" : isMe ? "me" : "other";
    buckets[bucket].push({
      path: `/api/${rel.replace("/route.ts", "")}`,
      file: relative(ROOT, route).replace(/\\/g, "/"),
      hasRequireRole,
      hasGetProviderId,
      hasCronSecret: /CRON_SECRET|INTERNAL_API_SECRET/.test(content),
    });
  }
  return buckets;
}

function buildPlatformInventory() {
  const packages = readdirSync(join(ROOT, "packages"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  return {
    audit_id: "AUDIT-2026-07-11",
    generated_at: new Date().toISOString(),
    scope: "multi_market_day_one",
    evidence_mode: "local_static_only",
    applications: [
      { id: "APP-001", name: "Web + API", path: "apps/web", stack: "Next.js 16, React 19", role: "Customer web, provider web, all backend APIs" },
      { id: "APP-002", name: "Admin SPA", path: "apps/admin-web", stack: "Vite 6, React Router 7", role: "Superadmin portal embedded at /admin/" },
      { id: "APP-003", name: "Customer Mobile", path: "apps/customer", stack: "Expo 54, RN 0.81", role: "Customer iOS/Android" },
      { id: "APP-004", name: "Provider Mobile", path: "apps/provider", stack: "Expo 54, RN 0.81", role: "Provider iOS/Android" },
    ],
    packages: packages.map((p, i) => ({ id: `PKG-${String(i + 1).padStart(3, "0")}`, name: p, path: `packages/${p}` })),
    infrastructure: {
      hosting: { provider: "Vercel", region: "cpt1", config: "apps/web/vercel.json" },
      database: { provider: "Supabase PostgreSQL", migrations: countMigrations(), path: "supabase/migrations" },
      mobile: { provider: "EAS", config: "eas.json" },
      cache: { provider: "Upstash Redis", fallback: "in-memory per instance" },
      ci: { workflows: walk(join(ROOT, ".github", "workflows"), (f) => f.endsWith(".yml")).length, path: ".github/workflows" },
      terraform: false,
      edge_functions: false,
    },
    api_route_count: countApiRoutes(),
    test_file_count: countTests(),
    cron_count: 41,
  };
}

function buildIntegrations() {
  return [
    { id: "INT-001", name: "Paystack", status: "full", owner: "platform", paths: ["apps/web/src/lib/payments/paystack-server.ts", "apps/web/src/app/api/payments/webhook/route.ts"], monitoring: true, reconciliation: true },
    { id: "INT-002", name: "PayCloud", status: "partial", owner: "platform", paths: ["apps/web/src/lib/payments/paycloud-client.ts", "apps/web/src/app/api/provider/paycloud/webhook/route.ts"], monitoring: true, reconciliation: true, gap: "same-terminal native module missing" },
    { id: "INT-003", name: "Yoco", status: "full", owner: "provider", paths: ["apps/web/src/app/api/provider/yoco/webhook/route.ts"], monitoring: true, reconciliation: true },
    { id: "INT-004", name: "Didit", status: "full", owner: "platform", paths: ["apps/web/src/app/api/webhooks/didit/route.ts", "apps/web/src/lib/identity-verification/identity-verification-service.ts"], monitoring: true, reconciliation: true },
    { id: "INT-005", name: "Wasender", status: "full", owner: "platform", paths: ["apps/web/src/app/api/webhooks/wasender/route.ts", "apps/web/src/lib/whatsapp/wasender-client.ts"], monitoring: true, reconciliation: false },
    { id: "INT-006", name: "Amplitude", status: "full", owner: "platform", paths: ["packages/analytics/", "apps/web/src/lib/analytics/amplitude/"], monitoring: false, reconciliation: false },
    { id: "INT-007", name: "Gemini", status: "full", owner: "platform", paths: ["apps/web/src/lib/ai/gemini.ts"], monitoring: false, reconciliation: false },
    { id: "INT-008", name: "Aura", status: "partial", owner: "platform", paths: ["apps/web/src/app/api/me/safety/panic/route.ts"], monitoring: false, reconciliation: false },
    { id: "INT-009", name: "OneSignal", status: "full", owner: "platform", paths: ["apps/web/src/lib/notifications/onesignal.ts"], monitoring: true, reconciliation: true },
    { id: "INT-010", name: "Mapbox", status: "full", owner: "platform", paths: ["apps/web/src/app/api/mapbox/"], monitoring: false, reconciliation: false },
    { id: "INT-011", name: "Stripe", status: "mock", owner: "none", paths: ["apps/admin-web/src/routes/settings/FeatureFlagsListPage.tsx"], monitoring: false, reconciliation: false, gap: "flag only, no processor code" },
    { id: "INT-012", name: "Flutterwave", status: "mock", owner: "none", paths: ["supabase/migrations/126_booking_payments_and_refunds.sql"], monitoring: false, reconciliation: false, gap: "enum only" },
    { id: "INT-013", name: "Aramex/BobGo/CourierGuy", status: "stub", owner: "platform", paths: ["packages/shipping/src/providers/"], monitoring: false, reconciliation: false, gap: "createShipment throws" },
    { id: "INT-014", name: "Slack", status: "full", owner: "ops", paths: ["apps/web/src/lib/integrations/slack/"], monitoring: true, reconciliation: false },
    { id: "INT-015", name: "Twilio", status: "full", owner: "platform", paths: ["apps/web/src/app/api/webhooks/twilio/route.ts"], monitoring: false, reconciliation: false },
  ];
}

function buildRoles() {
  return {
    roles: [
      { id: "ROL-001", name: "customer", db_enum: true, apps: ["APP-001", "APP-003"] },
      { id: "ROL-002", name: "provider_owner", db_enum: true, apps: ["APP-001", "APP-004"] },
      { id: "ROL-003", name: "provider_staff", db_enum: true, apps: ["APP-001", "APP-004"], granular_permissions: true },
      { id: "ROL-004", name: "superadmin", db_enum: true, apps: ["APP-001", "APP-002"] },
      { id: "ROL-005", name: "support_agent", db_enum: true, apps: ["APP-002"] },
      { id: "ROL-006", name: "admin_support", db_enum: true, apps: ["APP-002"], section: "support" },
      { id: "ROL-007", name: "admin_finance", db_enum: true, apps: ["APP-002"], section: "finance" },
      { id: "ROL-008", name: "admin_trust", db_enum: true, apps: ["APP-002"], section: "trust" },
      { id: "ROL-009", name: "admin_content", db_enum: true, apps: ["APP-002"], section: "content" },
      { id: "ROL-010", name: "admin_ecommerce", db_enum: true, apps: ["APP-002"], section: "ecommerce" },
      { id: "ROL-011", name: "admin_marketing", db_enum: true, apps: ["APP-002"], section: "marketing" },
      { id: "ROL-012", name: "admin_integrations", db_enum: true, apps: ["APP-002"], section: "integrations" },
      { id: "ROL-013", name: "admin_operations", db_enum: true, apps: ["APP-002"], section: "operations" },
      { id: "ROL-014", name: "admin_platform_config", db_enum: true, apps: ["APP-002"], section: "platform_config" },
      { id: "ROL-015", name: "provider_onboarding", db_enum: false, apps: ["APP-001", "APP-004"], note: "TS-only legacy role, not in PG enum" },
    ],
    enforcement_layers: ["api_middleware", "rls", "edge_proxy", "staff_permissions_jsonb"],
    rls_migration_count: walk(join(ROOT, "supabase", "migrations"), (f) => f.endsWith(".sql") && readFileSync(f, "utf8").includes("ROW LEVEL SECURITY")).length,
  };
}

function buildJourneys() {
  const journeys = [
    // Customer
    { id: "JRN-001", name: "Registration to verified account", lead_agent: 2, result: "partial_pass", apps: ["APP-001", "APP-003"], apis: ["/api/me/verification", "/api/me/identity-verification/session"], findings: ["FND-P1-004"] },
    { id: "JRN-002", name: "Login, logout and recovery", lead_agent: 2, result: "pass", apps: ["APP-001", "APP-003"], apis: ["/api/auth/signout-global"], findings: [] },
    { id: "JRN-003", name: "Search to booking or purchase", lead_agent: 2, result: "partial_pass", apps: ["APP-001"], apis: ["/api/public/search", "/api/public/booking-holds"], findings: ["FND-P0-004", "FND-P1-002"] },
    { id: "JRN-004", name: "Checkout to payment confirmation", lead_agent: 2, result: "cannot_verify", apps: ["APP-001", "APP-003"], apis: ["/api/payments/initialize", "/api/payments/webhook"], findings: ["FND-P0-002"] },
    { id: "JRN-005", name: "Promotion redemption", lead_agent: 2, result: "partial_pass", apps: ["APP-001"], apis: ["/api/promotions/validate"], findings: [] },
    { id: "JRN-006", name: "Cancellation and refund", lead_agent: 2, result: "partial_pass", apps: ["APP-001", "APP-003"], apis: ["/api/me/bookings/[id]/cancel"], findings: [] },
    { id: "JRN-007", name: "Rescheduling", lead_agent: 2, result: "pass", apps: ["APP-001", "APP-003"], apis: ["reschedule-core.ts"], findings: [] },
    { id: "JRN-008", name: "Complaint and dispute", lead_agent: 2, result: "partial_pass", apps: ["APP-001"], apis: ["/api/me/support-tickets"], findings: [] },
    { id: "JRN-009", name: "Review and rating", lead_agent: 2, result: "pass", apps: ["APP-001", "APP-003"], apis: ["/api/me/bookings/[id]/review"], findings: [] },
    { id: "JRN-010", name: "Subscription purchase and upgrade", lead_agent: 2, result: "partial_pass", apps: ["APP-001", "APP-003"], apis: ["/api/me/membership/subscribe"], findings: [] },
    { id: "JRN-011", name: "Account closure", lead_agent: 2, result: "pass", apps: ["APP-001"], apis: ["/api/me/account/delete"], findings: [] },
    { id: "JRN-012", name: "Privacy request", lead_agent: 2, result: "partial_pass", apps: ["APP-001"], apis: ["compliance purge RPCs"], findings: ["FND-P1-017"] },
    { id: "JRN-013", name: "Failed payment recovery", lead_agent: 2, result: "cannot_verify", apps: ["APP-001"], apis: ["/api/payments/webhook"], findings: ["FND-P0-002"] },
    { id: "JRN-014", name: "Weak-network recovery", lead_agent: 3, result: "partial_pass", apps: ["APP-003"], apis: [], findings: [] },
    { id: "JRN-015", name: "Web-to-mobile continuity", lead_agent: 3, result: "partial_pass", apps: ["APP-001", "APP-003"], apis: [], findings: [] },
    // Provider
    { id: "JRN-016", name: "Provider registration", lead_agent: 4, result: "pass", apps: ["APP-001", "APP-004"], apis: ["/api/provider/onboarding"], findings: [] },
    { id: "JRN-017", name: "KYC and business verification", lead_agent: 4, result: "partial_pass", apps: ["APP-001", "APP-004"], apis: ["/api/provider/identity-verification/session"], findings: ["FND-P1-004"] },
    { id: "JRN-018", name: "Document rejection and resubmission", lead_agent: 4, result: "partial_pass", apps: ["APP-001"], apis: ["/api/admin/identity-verification/sessions"], findings: [] },
    { id: "JRN-019", name: "Superadmin approval", lead_agent: 6, result: "pass", apps: ["APP-002"], apis: ["/api/admin/providers"], findings: [] },
    { id: "JRN-020", name: "Service configuration", lead_agent: 4, result: "pass", apps: ["APP-001", "APP-004"], apis: ["/api/provider/services"], findings: [] },
    { id: "JRN-021", name: "Pricing and availability", lead_agent: 4, result: "pass", apps: ["APP-001", "APP-004"], apis: ["/api/provider/settings/operating-hours"], findings: [] },
    { id: "JRN-022", name: "First booking acceptance", lead_agent: 4, result: "pass", apps: ["APP-001", "APP-004"], apis: ["/api/provider/bookings"], findings: [] },
    { id: "JRN-023", name: "Service fulfilment", lead_agent: 4, result: "pass", apps: ["APP-001", "APP-004"], apis: ["/api/provider/bookings/[id]/complete-service"], findings: [] },
    { id: "JRN-024", name: "Proof of completion", lead_agent: 4, result: "partial_pass", apps: ["APP-004"], apis: [], findings: [] },
    { id: "JRN-025", name: "Earnings calculation", lead_agent: 9, result: "pass", apps: ["APP-001"], apis: ["finance_transactions trigger"], findings: [] },
    { id: "JRN-026", name: "Settlement and payout", lead_agent: 9, result: "cannot_verify", apps: ["APP-001", "APP-002"], apis: ["/api/provider/payouts", "/api/admin/payouts/[id]/initiate-transfer"], findings: ["FND-P0-002"] },
    { id: "JRN-027", name: "Failed payout recovery", lead_agent: 9, result: "partial_pass", apps: ["APP-002"], apis: ["/api/admin/payouts/[id]/mark-failed"], findings: [] },
    { id: "JRN-028", name: "Subscription upgrade", lead_agent: 4, result: "pass", apps: ["APP-001", "APP-004"], apis: ["/api/provider/subscription/upgrade"], findings: [] },
    { id: "JRN-029", name: "Feature entitlement activation", lead_agent: 4, result: "pass", apps: ["APP-001"], apis: ["/api/feature-flags/check"], findings: [] },
    { id: "JRN-030", name: "Suspension and reinstatement", lead_agent: 6, result: "pass", apps: ["APP-002"], apis: ["/api/admin/providers/[id]"], findings: [] },
    { id: "JRN-031", name: "Provider account termination", lead_agent: 4, result: "partial_pass", apps: ["APP-001"], apis: ["compliance purge"], findings: [] },
    // Superadmin
    { id: "JRN-032", name: "Provider review and approval", lead_agent: 6, result: "pass", apps: ["APP-002"], apis: ["/api/admin/providers"], findings: [] },
    { id: "JRN-033", name: "Customer investigation", lead_agent: 6, result: "pass", apps: ["APP-002"], apis: ["/api/admin/users"], findings: [] },
    { id: "JRN-034", name: "Refund approval", lead_agent: 6, result: "pass", apps: ["APP-002"], apis: ["/api/admin/refunds"], findings: [] },
    { id: "JRN-035", name: "Dispute resolution", lead_agent: 6, result: "pass", apps: ["APP-002"], apis: ["/api/admin/disputes"], findings: [] },
    { id: "JRN-036", name: "Payout investigation", lead_agent: 6, result: "partial_pass", apps: ["APP-002"], apis: ["/api/admin/payouts"], findings: [] },
    { id: "JRN-037", name: "Data correction", lead_agent: 6, result: "partial_pass", apps: ["APP-002"], apis: ["/api/admin/bookings"], findings: [] },
    { id: "JRN-038", name: "Role assignment", lead_agent: 6, result: "pass", apps: ["APP-002"], apis: ["/api/admin/settings/admin-team"], findings: [] },
    { id: "JRN-039", name: "Feature flag activation", lead_agent: 6, result: "pass", apps: ["APP-002"], apis: ["/api/admin/feature-flags"], findings: [] },
    { id: "JRN-040", name: "Subscription plan management", lead_agent: 6, result: "pass", apps: ["APP-002"], apis: ["/api/admin/subscription-plans"], findings: [] },
    { id: "JRN-041", name: "Promotion creation", lead_agent: 6, result: "pass", apps: ["APP-002"], apis: ["/api/admin/promotions"], findings: [] },
    { id: "JRN-042", name: "Announcement publication", lead_agent: 6, result: "pass", apps: ["APP-002"], apis: ["/api/admin/broadcast"], findings: [] },
    { id: "JRN-043", name: "Integration failure investigation", lead_agent: 6, result: "partial_pass", apps: ["APP-002"], apis: ["/api/admin/control-plane/integrations"], findings: [] },
    { id: "JRN-044", name: "Failed-job recovery", lead_agent: 6, result: "partial_pass", apps: ["APP-002"], apis: ["cron routes"], findings: ["FND-P1-009"] },
    { id: "JRN-045", name: "Impersonation or assisted support", lead_agent: 6, result: "partial_pass", apps: ["APP-002"], apis: [], findings: [] },
    { id: "JRN-046", name: "Audit-history review", lead_agent: 6, result: "pass", apps: ["APP-002"], apis: ["/api/admin/audit-logs"], findings: [] },
    // Platform
    { id: "JRN-047", name: "Payment to provider payout reconciliation", lead_agent: 9, result: "cannot_verify", apps: ["APP-001"], apis: ["reconciliation-gate cron"], findings: ["FND-P1-008"] },
    { id: "JRN-048", name: "Integration failure and retry", lead_agent: 10, result: "partial_pass", apps: ["APP-001"], apis: ["webhook idempotency"], findings: [] },
    { id: "JRN-049", name: "Notification failure and recovery", lead_agent: 10, result: "partial_pass", apps: ["APP-001"], apis: ["/api/cron/process-notification-queue"], findings: [] },
    { id: "JRN-050", name: "Document expiry and suspension", lead_agent: 4, result: "partial_pass", apps: ["APP-001"], apis: ["identity-verification-reconcile cron"], findings: [] },
    { id: "JRN-051", name: "Role change and immediate permission enforcement", lead_agent: 7, result: "partial_pass", apps: ["APP-001"], apis: [], findings: [] },
    { id: "JRN-052", name: "Cross-tenant access attempt", lead_agent: 7, result: "cannot_verify", apps: ["APP-001"], apis: ["tenant RLS"], findings: ["FND-P0-003"] },
    { id: "JRN-053", name: "Duplicate request handling", lead_agent: 9, result: "pass", apps: ["APP-001"], apis: ["webhook-idempotency.ts"], findings: [] },
    { id: "JRN-054", name: "Backup restore", lead_agent: 15, result: "cannot_verify", apps: [], apis: [], findings: ["FND-P1-016"] },
    { id: "JRN-055", name: "Deployment rollback", lead_agent: 15, result: "partial_pass", apps: ["APP-001"], apis: [], findings: [] },
    { id: "JRN-056", name: "Major incident escalation", lead_agent: 16, result: "partial_pass", apps: [], apis: [], findings: ["FND-P1-009"] },
  ];
  return { journeys, summary: summarizeJourneys(journeys) };
}

function summarizeJourneys(journeys) {
  const counts = { pass: 0, partial_pass: 0, fail: 0, blocked: 0, cannot_verify: 0 };
  for (const j of journeys) counts[j.result] = (counts[j.result] || 0) + 1;
  return counts;
}

function buildFindings() {
  return [
    { id: "FND-P0-001", severity: "P1", title: "CSRF uses CRON_SECRET fallback; dedicated CSRF_SECRET recommended", agent: 8, application: "APP-001", capability: "CAP-SEC-001", environment: "production", status: "mitigated", description: "Production CSRF active via CRON_SECRET fallback; build gate wired", expected: "Dedicated CSRF_SECRET in production", actual: "CSRF enforced; shared secret fallback", evidence: ["EVD-001"], remediation: "REM-001", owner: "platform-engineering", go_live_impact: "high", confidence: "high" },
    { id: "FND-P0-002", severity: "P0", title: "E2E coverage critically thin for money paths", agent: 13, application: "APP-001", capability: "CAP-QA-001", environment: "local", status: "open", description: "Only 2 Playwright E2E specs exist; no payment webhook or payout E2E", expected: "Critical journeys have automated E2E coverage", actual: "booking-happy-path and admin login-shell only", evidence: ["EVD-002", "EVD-003"], remediation: "REM-006", owner: "qa-engineering", go_live_impact: "blocker", confidence: "high" },
    { id: "FND-P0-003", severity: "P0", title: "Multi-market tenant isolation unverified at runtime", agent: 7, application: "APP-001", capability: "CAP-TENANT-001", environment: "local", status: "open", description: "resolveTenantIdWithZaFallback used in 100+ routes; no live cross-tenant penetration test", expected: "Strict tenant isolation under real Host headers for all markets", actual: "Static traces show ZA fallback paths; runtime isolation not proven", evidence: ["EVD-004", "EVD-005"], remediation: "REM-007", owner: "platform-security", go_live_impact: "blocker", confidence: "medium" },
    { id: "FND-P0-004", severity: "P0", title: "Search map displays fake coordinates", agent: 2, application: "APP-001", capability: "CAP-SEARCH-001", environment: "local", status: "resolved", description: "Map pins use random London coordinates when API lacks lat/lng", expected: "Map shows accurate provider locations", actual: "Misleading random pins near 51.5074", evidence: ["EVD-006"], remediation: "REM-003", owner: "customer-web", go_live_impact: "blocker", confidence: "high" },
    { id: "FND-P0-005", severity: "P0", title: "Shipping integration fully stubbed", agent: 10, application: "APP-001", capability: "CAP-ECOM-001", environment: "local", status: "resolved", description: "All courier providers throw on createShipment", expected: "Product delivery orders create real shipments", actual: "createShipment throws not yet implemented", evidence: ["EVD-007"], remediation: "REM-005", owner: "ecommerce", go_live_impact: "blocker", confidence: "high" },
    { id: "FND-P0-006", severity: "P0", title: "POS creates unpersisted client IDs", agent: 4, application: "APP-001", capability: "CAP-POS-001", environment: "local", status: "resolved", description: "NewSaleDialog creates local-only client with temp ID", expected: "New clients persisted via API before sale", actual: "id: new-client-${Date.now()} without API call", evidence: ["EVD-008"], remediation: "REM-004", owner: "provider-web", go_live_impact: "blocker", confidence: "high" },
    { id: "FND-P0-007", severity: "P0", title: "Time-clock returns fake success on missing tables", agent: 4, application: "APP-001", capability: "CAP-STAFF-001", environment: "local", status: "resolved", description: "Clock-in returns success with temp ID when staff_time_cards missing", expected: "Error or migration-required response", actual: "Fake success masks migration failures", evidence: ["EVD-009"], remediation: "REM-002", owner: "provider-web", go_live_impact: "blocker", confidence: "high" },
    { id: "FND-P1-001", severity: "P1", title: "PayCloud same-terminal incomplete", agent: 10, application: "APP-004", capability: "CAP-PAY-002", environment: "local", status: "mitigated", description: "Native module missing; cloud-only launch gate formalized", expected: "Same-device terminal payments on provider mobile", actual: "Cloud-only for launch; flag off by default", evidence: ["EVD-010"], remediation: "REM-013", owner: "payments", go_live_impact: "high", confidence: "high" },
    { id: "FND-P1-002", severity: "P1", title: "Advanced search filters no-op", agent: 2, application: "APP-001", capability: "CAP-SEARCH-001", environment: "local", status: "resolved", description: "date/time availability and price filters unused in advanced search", expected: "Filters narrow provider results", actual: "Filters are no-ops returning all providers", evidence: ["EVD-011"], remediation: "REM-014", owner: "customer-web", go_live_impact: "high", confidence: "high" },
    { id: "FND-P1-003", severity: "P1", title: "ZA postal areas placeholder seed only", agent: 11, application: "APP-001", capability: "CAP-ZONE-001", environment: "local", status: "open", description: "Migration 294 is tiny placeholder sample not production coverage", expected: "Full postal area dataset for service zones", actual: "Placeholder sample only", evidence: ["EVD-012"], remediation: "REM-008", owner: "data-ops", go_live_impact: "high", confidence: "high" },
    { id: "FND-P1-004", severity: "P1", title: "KYB verification flags off by default", agent: 4, application: "APP-001", capability: "CAP-KYB-001", environment: "local", status: "open", description: "Provider KYB verification disabled by default in migration 773", expected: "KYB enforced for provider go-live per market policy", actual: "Flags off; manual decision required", evidence: ["EVD-013"], remediation: "REM-012", owner: "compliance", go_live_impact: "high", confidence: "high" },
    { id: "FND-P1-005", severity: "P1", title: "Rate limiting in-memory fallback on multi-instance", agent: 8, application: "APP-001", capability: "CAP-SEC-002", environment: "local", status: "partial", description: "Production guard and fail-closed on sensitive limiters; Upstash env still manual", expected: "Distributed rate limiting in production", actual: "Code warns and blocks sign-in/payment/payout without Upstash in prod", evidence: ["EVD-014"], remediation: "REM-009", owner: "platform-engineering", go_live_impact: "high", confidence: "high" },
    { id: "FND-P1-006", severity: "P1", title: "CSP allows unsafe-inline and unsafe-eval", agent: 8, application: "APP-001", capability: "CAP-SEC-003", environment: "local", status: "partial", description: "Report-only nonce CSP shipped; enforced policy unchanged pending staging verification", expected: "Nonce-based CSP in production", actual: "Content-Security-Policy-Report-Only with per-request nonce", evidence: ["EVD-015"], remediation: "REM-015", owner: "security", go_live_impact: "medium", confidence: "high" },
    { id: "FND-P1-007", severity: "P1", title: "Stripe and Flutterwave appear but not implemented", agent: 10, application: "APP-002", capability: "CAP-PAY-003", environment: "local", status: "resolved", description: "Feature flags and enums reference unimplemented gateways", expected: "Only implemented gateways exposed to operators", actual: "Stripe hidden from operator toggles", evidence: ["EVD-016"], remediation: "REM-019", owner: "product", go_live_impact: "medium", confidence: "high" },
    { id: "FND-P1-008", severity: "P1", title: "7-day staging drift gate unsigned", agent: 15, application: "APP-001", capability: "CAP-FIN-001", environment: "local", status: "open", description: "LAUNCH_READINESS_100 sign-off table empty", expected: "7 consecutive days zero drift with sign-off", actual: "Human gate not executed", evidence: ["EVD-017"], remediation: "REM-010", owner: "finance", go_live_impact: "high", confidence: "high" },
    { id: "FND-P1-009", severity: "P1", title: "Game-day drills documented but unverified", agent: 16, application: "APP-001", capability: "CAP-OPS-001", environment: "local", status: "open", description: "GAME_DAY_RUNBOOK exists but no evidence of completed drills", expected: "All drill scenarios executed with evidence", actual: "Runbook only; no drill completion records", evidence: ["EVD-018"], remediation: "REM-011", owner: "sre", go_live_impact: "high", confidence: "high" },
    { id: "FND-P1-010", severity: "P1", title: "Custom offer image upload not implemented", agent: 2, application: "APP-001", capability: "CAP-MSG-001", environment: "local", status: "resolved", description: "Image upload shows toast that functionality needs implementation", expected: "Providers can attach images to custom offers", actual: "Toast blocks feature", evidence: ["EVD-019"], remediation: "REM-020", owner: "messaging", go_live_impact: "medium", confidence: "high" },
    { id: "FND-P1-011", severity: "P1", title: "Admin SPA HTML served without edge role gate", agent: 7, application: "APP-002", capability: "CAP-ADMIN-001", environment: "local", status: "resolved", description: "proxy.ts rewrites /admin HTML without server role check", expected: "Admin shell requires authentication at edge", actual: "HTML served; API routes gated separately", evidence: ["EVD-020"], remediation: "REM-021", owner: "platform-security", go_live_impact: "medium", confidence: "high" },
    { id: "FND-P1-012", severity: "P1", title: "API authorization relies on service-role bypass", agent: 7, application: "APP-001", capability: "CAP-SEC-004", environment: "local", status: "open", description: "Most API routes use getSupabaseAdmin bypassing RLS", expected: "Defense in depth with RLS + API guards", actual: "API middleware is sole boundary for most routes", evidence: ["EVD-021"], remediation: "REM-022", owner: "platform-security", go_live_impact: "high", confidence: "high" },
    { id: "FND-P1-013", severity: "P1", title: "QR scanner manual input only", agent: 4, application: "APP-001", capability: "CAP-POS-002", environment: "local", status: "resolved", description: "QRCodeScanner has no camera library integrated", expected: "Camera-based QR scanning for POS", actual: "Manual input fallback only", evidence: ["EVD-022"], remediation: "REM-023", owner: "provider-web", go_live_impact: "medium", confidence: "high" },
    { id: "FND-P1-014", severity: "P1", title: "Service zone analytics ignores polygon/radius zones", agent: 4, application: "APP-001", capability: "CAP-ZONE-001", environment: "local", status: "resolved", description: "Analytics route returns false for polygon and radius zone types", expected: "Accurate zone analytics for all zone types", actual: "Polygon/radius skipped", evidence: ["EVD-023"], remediation: "REM-024", owner: "provider-web", go_live_impact: "medium", confidence: "high" },
    { id: "FND-P1-015", severity: "P1", title: "LAUNCH_READINESS_100 contradicts discovered gaps", agent: 19, application: "APP-001", capability: "CAP-DOC-001", environment: "local", status: "resolved", description: "Internal doc claims 100% engineering complete", expected: "Readiness doc reflects verified evidence", actual: "Claims 100% while P0 gaps exist in code", evidence: ["EVD-017", "EVD-006", "EVD-007"], remediation: "REM-025", owner: "release-captain", go_live_impact: "high", confidence: "high" },
    { id: "FND-P1-016", severity: "P1", title: "Backup restore not verified", agent: 15, application: "APP-001", capability: "CAP-DR-001", environment: "local", status: "partial", description: "Post-restore row-count script added; actual restore still manual", expected: "Documented and tested backup restore", actual: "Cannot verify without staging restore", evidence: ["EVD-024"], remediation: "REM-026", owner: "sre", go_live_impact: "high", confidence: "medium" },
    { id: "FND-P1-017", severity: "P1", title: "Legal documents not verifiable in repository", agent: 17, application: "APP-001", capability: "CAP-LEGAL-001", environment: "local", status: "open", description: "Privacy policy and T&Cs likely CMS-hosted; not audited in repo", expected: "Per-market legal documents published and linked", actual: "Cannot verify from codebase alone", evidence: ["EVD-025"], remediation: "REM-018", owner: "legal", go_live_impact: "high", confidence: "low" },
    { id: "FND-P2-001", severity: "P2", title: "provider_onboarding role not in PG enum", agent: 7, application: "APP-001", capability: "CAP-AUTH-001", environment: "local", status: "resolved", description: "TS role provider_onboarding absent from database enum", expected: "Role enum consistency between TS and DB", actual: "Type/DB drift", evidence: ["EVD-026"], remediation: "REM-027", owner: "platform-engineering", go_live_impact: "low", confidence: "high" },
    { id: "FND-P2-002", severity: "P2", title: "Hardcoded category fallback on mobile", agent: 3, application: "APP-003", capability: "CAP-HOME-001", environment: "local", status: "resolved", description: "useGlobalCategories falls back to hardcoded categories on API failure", expected: "Graceful empty state without misleading data", actual: "Shows hardcoded hair/nails/face/body", evidence: ["EVD-027"], remediation: "REM-028", owner: "customer-mobile", go_live_impact: "low", confidence: "high" },
    { id: "FND-P2-003", severity: "P2", title: "No recent load test results in repository", agent: 14, application: "APP-001", capability: "CAP-PERF-001", environment: "local", status: "partial", description: "k6 scripts exist but no stored results from recent runs", expected: "Load test baselines documented", actual: "Scripts only; endpoint paths fixed", evidence: ["EVD-028"], remediation: "REM-029", owner: "sre", go_live_impact: "medium", confidence: "high" },
    { id: "FND-P3-001", severity: "P3", title: "Support ticket labels mention Stripe for payouts", agent: 18, application: "APP-002", capability: "CAP-UX-001", environment: "local", status: "resolved", description: "Cosmetic mismatch with Paystack-only payouts", expected: "Accurate payment provider labels", actual: "Stripe mentioned in support categories", evidence: ["EVD-029"], remediation: "REM-030", owner: "content", go_live_impact: "none", confidence: "high" },
    { id: "FND-P1-018", severity: "P1", title: "Web typecheck failure blocks release:check", agent: 15, application: "APP-001", capability: "CAP-DEVOPS-001", environment: "local", status: "resolved", description: "terminal-shop CTA narrowed with cta.kind === 'order'; tsc passes", expected: "release:check passes on main branch", actual: "tsc --noEmit exits with code 2", evidence: ["EVD-036"], remediation: "REM-031", owner: "provider-web", go_live_impact: "high", confidence: "high" },
    { id: "FND-P1-019", severity: "P1", title: "Provider API routes missing tenant guard heuristic", agent: 7, application: "APP-001", capability: "CAP-TENANT-001", environment: "local", status: "resolved", description: "Heuristic improved; regression script added; 12 genuinely unguarded routes fixed", expected: "All provider routes scope data to authenticated provider tenant", actual: "check-provider-tenant-guards.mjs passes with 0 failures", evidence: ["EVD-037"], remediation: "REM-032", owner: "platform-security", go_live_impact: "high", confidence: "high" },
    { id: "FND-P1-020", severity: "P1", title: "Production config-bundle exposes test Paystack key", agent: 8, application: "APP-001", capability: "CAP-SEC-001", environment: "production", status: "partial", description: "pk_test_ in region_settings_public; requires DB/admin fix for pk_live_", expected: "Production bundle uses pk_live_ keys", actual: "Test key in production region settings", evidence: ["EVD-038"], remediation: "REM-033", owner: "platform-engineering", go_live_impact: "high", confidence: "high" },
  ];
}

function buildEvidence() {
  return [
    { id: "EVD-001", type: "source_code", path: "apps/web/src/lib/csrf.ts", lines: "10-18", description: "CSRF disabled when secret unset" },
    { id: "EVD-002", type: "test_file", path: "apps/web/e2e/booking-happy-path.spec.ts", description: "Only web E2E spec" },
    { id: "EVD-003", type: "test_file", path: "apps/admin-web/e2e/login-shell.spec.ts", description: "Only admin E2E spec" },
    { id: "EVD-004", type: "source_code", path: "apps/web/src/lib/tenant/resolve-tenant-from-db.ts", description: "ZA fallback tenant resolution" },
    { id: "EVD-005", type: "test_file", path: "apps/web/src/__tests__/api/public-home-tenant-strict.test.ts", description: "Tenant strict mode unit tests exist but no E2E" },
    { id: "EVD-006", type: "source_code", path: "apps/web/src/app/search/components/places.tsx", description: "Random London map coordinates" },
    { id: "EVD-007", type: "source_code", path: "packages/shipping/src/providers/aramex.ts", description: "createShipment throws" },
    { id: "EVD-008", type: "source_code", path: "apps/web/src/components/provider-portal/NewSaleDialog.tsx", description: "Unpersisted client ID" },
    { id: "EVD-009", type: "source_code", path: "apps/web/src/app/api/provider/time-clock/route.ts", description: "Fake success on missing table" },
    { id: "EVD-010", type: "documentation", path: "docs/PAYCLOUD_SAME_TERMINAL_SPIKE.md", description: "Same-terminal spike incomplete" },
    { id: "EVD-011", type: "source_code", path: "apps/web/src/app/api/search/advanced/route.ts", description: "No-op filters" },
    { id: "EVD-012", type: "migration", path: "supabase/migrations/294_seed_postal_areas_za.sql", description: "Placeholder postal seed" },
    { id: "EVD-013", type: "migration", path: "supabase/migrations/773_provider_kyb_verification.sql", description: "KYB flags off by default" },
    { id: "EVD-014", type: "source_code", path: "apps/web/src/lib/rate-limit/store.ts", description: "In-memory fallback" },
    { id: "EVD-015", type: "source_code", path: "apps/web/next.config.mjs", lines: "287-289", description: "CSP unsafe-inline eval" },
    { id: "EVD-016", type: "source_code", path: "apps/admin-web/src/routes/settings/FeatureFlagsListPage.tsx", description: "Stripe not enforced" },
    { id: "EVD-017", type: "documentation", path: "docs/LAUNCH_READINESS_100.md", description: "Unsigned 7-day gate" },
    { id: "EVD-018", type: "documentation", path: "docs/GAME_DAY_RUNBOOK.md", description: "Drills documented not executed" },
    { id: "EVD-019", type: "source_code", path: "apps/web/src/components/messaging/custom-offer-modal.tsx", description: "Image upload not implemented" },
    { id: "EVD-020", type: "source_code", path: "apps/web/src/proxy.ts", lines: "211-216", description: "Admin HTML without role gate" },
    { id: "EVD-021", type: "source_code", path: "apps/web/src/lib/supabase/api-helpers.ts", description: "Service role admin client pattern" },
    { id: "EVD-022", type: "source_code", path: "apps/web/src/components/provider-portal/QRCodeScanner.tsx", description: "Manual input only" },
    { id: "EVD-023", type: "source_code", path: "apps/web/src/app/api/provider/service-zones/analytics/route.ts", description: "Polygon/radius skipped" },
    { id: "EVD-024", type: "documentation", path: "docs/BACKUP_AND_DR_RUNBOOK.md", description: "DR runbook without test evidence" },
    { id: "EVD-025", type: "documentation", path: "docs/compliance/DATA_RETENTION_AND_ERASURE.md", description: "POPIA controls documented" },
    { id: "EVD-026", type: "source_code", path: "packages/types/src/domain.ts", description: "provider_onboarding TS-only role" },
    { id: "EVD-027", type: "source_code", path: "apps/customer/src/features/home/useGlobalCategories.ts", description: "Hardcoded fallback categories" },
    { id: "EVD-028", type: "test_script", path: "tooling/load-test/k6-booking-flow.js", description: "k6 script without stored results" },
    { id: "EVD-029", type: "source_code", path: "apps/web/src/lib/support/supportTicketCategories.ts", description: "Stripe label mismatch" },
    { id: "EVD-030", type: "test_count", path: "repository", description: `${countTests()} test files across monorepo` },
    { id: "EVD-031", type: "api_count", path: "apps/web/src/app/api", description: `${countApiRoutes()} API route handlers` },
    { id: "EVD-032", type: "migration_count", path: "supabase/migrations", description: `${countMigrations()} SQL migrations` },
    { id: "EVD-033", type: "documentation", path: "docs/PAYMENT_ACCOUNTING_CONTRACT.md", description: "Financial chain contract" },
    { id: "EVD-034", type: "source_code", path: "apps/web/src/lib/payment/webhook-idempotency.ts", description: "Webhook dedup mechanism" },
    { id: "EVD-035", type: "test_file", path: "apps/web/src/lib/ledger/__tests__/reconciliation-drift.test.ts", description: "Ledger drift unit tests" },
  ];
}

function buildCapabilities() {
  return [
    { id: "CAP-BOOK-001", name: "Public booking hold and checkout", status: "full", apps: ["APP-001", "APP-003"], apis: ["/api/public/booking-holds", "/api/payments/initialize"], db: ["bookings", "booking_holds"], tests: true },
    { id: "CAP-PAY-001", name: "Paystack online payments", status: "full", apps: ["APP-001"], apis: ["/api/payments/webhook"], db: ["booking_payments", "payment_transactions"], tests: true },
    { id: "CAP-PAY-002", name: "PayCloud terminal payments", status: "partial", apps: ["APP-001", "APP-004"], apis: ["/api/provider/paycloud"], db: ["paycloud_webhook_events"], tests: true, gap: "same-terminal incomplete" },
    { id: "CAP-PAYOUT-001", name: "Provider payout requests", status: "full", apps: ["APP-001", "APP-002"], apis: ["/api/provider/payouts", "/api/admin/payouts"], db: ["payouts", "finance_transactions"], tests: true },
    { id: "CAP-KYC-001", name: "Didit identity verification", status: "full", apps: ["APP-001", "APP-002"], apis: ["/api/webhooks/didit"], db: ["identity_verification_sessions"], tests: true },
    { id: "CAP-KYB-001", name: "Provider KYB verification", status: "partial", apps: ["APP-001"], apis: ["/api/provider/identity-verification/business-session"], db: ["providers.kyb_verification_status"], tests: false, gap: "flags off by default" },
    { id: "CAP-SEARCH-001", name: "Provider search and discovery", status: "partial", apps: ["APP-001", "APP-003"], apis: ["/api/public/search"], db: ["providers"], tests: true, gap: "fake map coords, no-op filters" },
    { id: "CAP-ECOM-001", name: "Product shipping", status: "stub", apps: ["APP-001"], apis: ["packages/shipping"], db: ["product_orders"], tests: true, gap: "courier stubs" },
    { id: "CAP-ADMIN-001", name: "Superadmin operations portal", status: "full", apps: ["APP-002"], apis: ["/api/admin/*"], db: ["audit_logs"], tests: true },
    { id: "CAP-TENANT-001", name: "Multi-tenant isolation", status: "partial", apps: ["APP-001"], apis: ["tenant resolution"], db: ["tenants", "tenant_domains"], tests: true, gap: "runtime unverified" },
    { id: "CAP-NOTIF-001", name: "Notification delivery queue", status: "full", apps: ["APP-001"], apis: ["/api/cron/process-notification-queue"], db: ["notification_delivery_queue"], tests: true },
    { id: "CAP-POS-001", name: "Provider POS walk-in sales", status: "partial", apps: ["APP-001"], apis: ["/api/provider/product-sales"], db: ["sales"], tests: true, gap: "unpersisted clients" },
  ];
}

function buildRemediation() {
  return [
    { id: "REM-001", wave: 0, title: "Enforce CSRF_SECRET in all environments", owner: "platform-engineering", effort: "S", status: "partial", finding: "FND-P0-001" },
    { id: "REM-002", wave: 0, title: "Remove fake-success API paths for time-clock and days-off", owner: "provider-web", effort: "S", status: "done", finding: "FND-P0-007" },
    { id: "REM-003", wave: 0, title: "Fix search map coordinates or disable map", owner: "customer-web", effort: "M", status: "done", finding: "FND-P0-004" },
    { id: "REM-004", wave: 1, title: "Fix NewSaleDialog client persistence", owner: "provider-web", effort: "S", status: "done", finding: "FND-P0-006" },
    { id: "REM-005", wave: 1, title: "Implement or disable shipping until couriers ready", owner: "ecommerce", effort: "L", status: "done", finding: "FND-P0-005" },
    { id: "REM-006", wave: 1, title: "Build E2E suite for booking payment refund payout", owner: "qa-engineering", effort: "L", status: "partial", finding: "FND-P0-002" },
    { id: "REM-007", wave: 1, title: "Multi-tenant isolation test suite", owner: "platform-security", effort: "L", status: "partial", finding: "FND-P0-003" },
    { id: "REM-008", wave: 2, title: "Complete postal area import for ZA", owner: "data-ops", effort: "M", status: "open", finding: "FND-P1-003" },
    { id: "REM-009", wave: 2, title: "Enable Upstash rate limiting in production", owner: "platform-engineering", effort: "S", status: "partial", finding: "FND-P1-005" },
    { id: "REM-010", wave: 2, title: "Execute 7-day staging drift observation", owner: "finance", effort: "M", status: "open", finding: "FND-P1-008" },
    { id: "REM-011", wave: 2, title: "Complete game-day drills with evidence", owner: "sre", effort: "M", status: "open", finding: "FND-P1-009" },
    { id: "REM-012", wave: 2, title: "KYB gating decision per market", owner: "compliance", effort: "S", status: "open", finding: "FND-P1-004" },
    { id: "REM-013", wave: 3, title: "PayCloud same-terminal ship or permanently gate", owner: "payments", effort: "L", status: "done", finding: "FND-P1-001" },
    { id: "REM-014", wave: 3, title: "Implement advanced search filters", owner: "customer-web", effort: "M", status: "done", finding: "FND-P1-002" },
    { id: "REM-015", wave: 3, title: "CSP nonce migration (report-only first)", owner: "security", effort: "M", status: "partial", finding: "FND-P1-006" },
    { id: "REM-016", wave: 4, title: "Per-tenant payment gateway validation", owner: "payments", effort: "L", status: "done", finding: "FND-P0-003" },
    { id: "REM-017", wave: 4, title: "Tighten ZA tenant fallback telemetry and strict mode", owner: "platform-engineering", effort: "M", status: "done", finding: "FND-P0-003" },
    { id: "REM-018", wave: 4, title: "Per-market legal documents and tax config", owner: "legal", effort: "L", status: "open", finding: "FND-P1-017" },
    { id: "REM-019", wave: 3, title: "Hide unimplemented payment gateways from operator UI", owner: "product", effort: "S", status: "done", finding: "FND-P1-007" },
    { id: "REM-020", wave: 3, title: "Wire custom offer image upload for providers", owner: "messaging", effort: "M", status: "done", finding: "FND-P1-010" },
    { id: "REM-021", wave: 3, title: "Admin SPA edge session gate", owner: "platform-security", effort: "S", status: "done", finding: "FND-P1-011" },
    { id: "REM-022", wave: 3, title: "Targeted API tenant-guard hardening", owner: "platform-security", effort: "L", status: "partial", finding: "FND-P1-012" },
    { id: "REM-023", wave: 3, title: "Consolidate QR scanning on html5-qrcode", owner: "provider-web", effort: "S", status: "done", finding: "FND-P1-013" },
    { id: "REM-024", wave: 3, title: "Service zone analytics polygon/radius support", owner: "provider-web", effort: "M", status: "done", finding: "FND-P1-014" },
    { id: "REM-025", wave: 3, title: "Rewrite LAUNCH_READINESS_100 with audit-backed status", owner: "release-captain", effort: "S", status: "done", finding: "FND-P1-015" },
    { id: "REM-026", wave: 3, title: "Post-restore row-count verification script", owner: "sre", effort: "S", status: "done", finding: "FND-P1-016" },
    { id: "REM-027", wave: 4, title: "Remove provider_onboarding from DB UserRole type", owner: "platform-engineering", effort: "S", status: "done", finding: "FND-P2-001" },
    { id: "REM-028", wave: 4, title: "Remove hardcoded mobile category fallback", owner: "customer-mobile", effort: "S", status: "done", finding: "FND-P2-002" },
    { id: "REM-029", wave: 4, title: "Fix k6 booking flow endpoint paths", owner: "sre", effort: "S", status: "done", finding: "FND-P2-003" },
    { id: "REM-030", wave: 4, title: "Update support labels from Stripe to Paystack", owner: "content", effort: "S", status: "done", finding: "FND-P3-001" },
    { id: "REM-031", wave: 1, title: "Fix terminal-shop typecheck error", owner: "provider-web", effort: "S", status: "done", finding: "FND-P1-018" },
    { id: "REM-032", wave: 1, title: "Review provider routes for tenant guard coverage", owner: "platform-security", effort: "M", status: "done", finding: "FND-P1-019" },
    { id: "REM-033", wave: 0, title: "Replace Paystack test key with live key in production", owner: "platform-engineering", effort: "S", status: "open", finding: "FND-P1-020" },
  ];
}

function buildApiGuardReport(buckets) {
  const summarize = (items) => ({
    total: items.length,
    with_auth_guard: items.filter((r) => r.hasRequireRole).length,
    without_auth_guard: items.filter((r) => !r.hasRequireRole).length,
    provider_missing_tenant_guard: items.filter((r) => r.path.startsWith("/api/provider/") && r.hasRequireRole && !r.hasGetProviderId).length,
    cron_with_secret: items.filter((r) => r.hasCronSecret).length,
  });
  return {
    generated_at: new Date().toISOString(),
    summary: {
      admin: summarize(buckets.admin),
      provider: summarize(buckets.provider),
      me: summarize(buckets.me),
      public: summarize(buckets.public),
      cron: summarize(buckets.cron),
      other: summarize(buckets.other),
    },
    samples: {
      admin_unguarded: buckets.admin.filter((r) => !r.hasRequireRole).slice(0, 10),
      provider_missing_tenant: buckets.provider.filter((r) => r.hasRequireRole && !r.hasGetProviderId).slice(0, 10),
    },
  };
}

function buildReadinessScores(challenger) {
  const domains = [
    { domain: "core_business_functionality", weight: 0.18, score: 76, confidence: "medium", agent: 2, challenger_adjustment: challenger ? -2 : 0 },
    { domain: "customer_web", weight: 0.07, score: 78, confidence: "medium", agent: 2, challenger_adjustment: challenger ? -3 : 0 },
    { domain: "customer_mobile", weight: 0.05, score: 74, confidence: "medium", agent: 3, challenger_adjustment: 0 },
    { domain: "provider_web", weight: 0.07, score: 74, confidence: "medium", agent: 4, challenger_adjustment: challenger ? -2 : 0 },
    { domain: "provider_mobile", weight: 0.05, score: 70, confidence: "medium", agent: 5, challenger_adjustment: 0 },
    { domain: "superadmin_operations", weight: 0.10, score: 80, confidence: "medium", agent: 6, challenger_adjustment: 0 },
    { domain: "security_identity_privacy", weight: 0.12, score: 68, confidence: "low", agent: 7, challenger_adjustment: challenger ? -3 : 0 },
    { domain: "payments_financial_integrity", weight: 0.08, score: 82, confidence: "medium", agent: 9, challenger_adjustment: challenger ? -2 : 0 },
    { domain: "data_reporting_integrations", weight: 0.08, score: 72, confidence: "medium", agent: 10, challenger_adjustment: 0 },
    { domain: "quality_assurance_testing", weight: 0.06, score: 52, confidence: "high", agent: 13, challenger_adjustment: 0 },
    { domain: "infrastructure_devops", weight: 0.05, score: 76, confidence: "low", agent: 15, challenger_adjustment: 0 },
    { domain: "performance_reliability", weight: 0.03, score: 63, confidence: "low", agent: 14, challenger_adjustment: 0 },
    { domain: "ux_accessibility", weight: 0.03, score: 66, confidence: "low", agent: 12, challenger_adjustment: 0 },
    { domain: "operational_readiness", weight: 0.02, score: 68, confidence: "low", agent: 16, challenger_adjustment: 0 },
    { domain: "legal_regulatory", weight: 0.01, score: 70, confidence: "low", agent: 17, challenger_adjustment: 0 },
  ];
  let weighted = 0;
  for (const d of domains) {
    d.final_score = Math.max(0, d.score + d.challenger_adjustment);
    d.weighted_score = d.final_score * d.weight;
    weighted += d.weighted_score;
  }
  const p0_count = 6;
  const p1_count = 21;
  const p2_count = 3;
  const p3_count = 1;
  const has_p0 = p0_count > 0;
  return {
    generated_at: new Date().toISOString(),
    evidence_mode: "local_static_only",
    challenger_reviewed: challenger,
    overall_readiness_percent: Math.round(weighted),
    overall_confidence: "medium",
    p0_count,
    p1_count,
    p2_count,
    p3_count,
    has_unresolved_p0: has_p0,
    recommendation: has_p0 ? "no_go_pending_critical_remediation" : "controlled_pilot",
    pilot_recommendation: "single_tenant_za_web_first_after_p0_p1_and_staging",
    domains,
    application_scores: {
      APP_001: 75,
      APP_002: 80,
      APP_003: 74,
      APP_004: 70,
    },
  };
}

function buildAgentDashboard() {
  return [
    { agent: 0, name: "Audit Coordinator", status: "complete", completion_percent: 100, findings: 0, evidence: 35, confidence: "medium" },
    { agent: 1, name: "Repository Discovery", status: "complete", completion_percent: 100, findings: 0, evidence: 5, confidence: "high" },
    { agent: 2, name: "Customer Web", status: "complete", completion_percent: 100, findings: 6, evidence: 8, confidence: "medium" },
    { agent: 3, name: "Customer Mobile", status: "complete", completion_percent: 100, findings: 2, evidence: 4, confidence: "medium" },
    { agent: 4, name: "Provider Web", status: "complete", completion_percent: 100, findings: 5, evidence: 7, confidence: "medium" },
    { agent: 5, name: "Provider Mobile", status: "complete", completion_percent: 100, findings: 1, evidence: 3, confidence: "medium" },
    { agent: 6, name: "Superadmin Operations", status: "complete", completion_percent: 100, findings: 2, evidence: 5, confidence: "medium" },
    { agent: 7, name: "Identity Permissions", status: "complete", completion_percent: 100, findings: 4, evidence: 6, confidence: "medium" },
    { agent: 8, name: "Security Privacy", status: "complete", completion_percent: 100, findings: 3, evidence: 5, confidence: "medium" },
    { agent: 9, name: "Payments Finance", status: "complete", completion_percent: 100, findings: 0, evidence: 6, confidence: "medium" },
    { agent: 10, name: "Integrations", status: "complete", completion_percent: 100, findings: 3, evidence: 5, confidence: "medium" },
    { agent: 11, name: "Data Reporting", status: "complete", completion_percent: 100, findings: 2, evidence: 4, confidence: "medium" },
    { agent: 12, name: "UX Accessibility", status: "complete", completion_percent: 100, findings: 2, evidence: 3, confidence: "low" },
    { agent: 13, name: "QA Testing", status: "complete", completion_percent: 100, findings: 1, evidence: 4, confidence: "high" },
    { agent: 14, name: "Performance", status: "complete", completion_percent: 100, findings: 1, evidence: 2, confidence: "low" },
    { agent: 15, name: "DevOps", status: "complete", completion_percent: 100, findings: 2, evidence: 4, confidence: "low" },
    { agent: 16, name: "Operations", status: "complete", completion_percent: 100, findings: 1, evidence: 2, confidence: "low" },
    { agent: 17, name: "Legal Compliance", status: "complete", completion_percent: 100, findings: 1, evidence: 2, confidence: "low" },
    { agent: 18, name: "False Completeness", status: "complete", completion_percent: 100, findings: 3, evidence: 5, confidence: "high" },
    { agent: 19, name: "Adversarial Challenger", status: "complete", completion_percent: 100, findings: 1, evidence: 3, confidence: "high" },
  ];
}

function writeJson(name, data) {
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 2) + "\n", "utf8");
}

function main() {
  const buckets = scanApiGuards();
  const platform = buildPlatformInventory();
  const integrations = buildIntegrations();
  const roles = buildRoles();
  const journeys = buildJourneys();
  const findings = buildFindings();
  const evidence = buildEvidence();
  const capabilities = buildCapabilities();
  const remediation = buildRemediation();
  const apiGuards = buildApiGuardReport(buckets);
  const readiness = buildReadinessScores(true);
  const agents = buildAgentDashboard();

  writeJson("platform-inventory.json", platform);
  writeJson("integration-register.json", { integrations });
  writeJson("roles-permissions.json", roles);
  writeJson("journey-register.json", journeys);
  writeJson("findings-register.json", { findings, summary: { P0: 6, P1: 21, P2: 3, P3: 1, total: 31 } });
  writeJson("evidence-register.json", { evidence });
  writeJson("capability-register.json", { capabilities });
  writeJson("remediation-backlog.json", { remediation });
  writeJson("api-guard-report.json", apiGuards);
  writeJson("readiness-scores.json", readiness);
  writeJson("agent-dashboard.json", { agents });
  writeJson("dependency-register.json", {
    dependencies: [
      { id: "DEP-001", from: "FND-P0-002", to: "REM-006", type: "remediation" },
      { id: "DEP-002", from: "JRN-004", to: "FND-P0-002", type: "blocked_by" },
      { id: "DEP-003", from: "JRN-052", to: "FND-P0-003", type: "blocked_by" },
      { id: "DEP-004", from: "REM-010", to: "staging_access", type: "requires" },
      { id: "DEP-005", from: "REM-011", to: "staging_access", type: "requires" },
    ],
  });

  console.log(`Audit registers written to ${OUT}`);
  console.log(`Overall readiness: ${readiness.overall_readiness_percent}%`);
  console.log(`P0: ${readiness.p0_count}, P1: ${readiness.p1_count}`);
}

main();
