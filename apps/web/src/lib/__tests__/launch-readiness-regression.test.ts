/**
 * Launch readiness regression tests (Phases 2–4).
 * Static + unit checks that protect money-path fixes without a live DB.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isCardMachineTipBookingPayment } from "@/lib/reports/recorded-takings";

const repoRoot = join(__dirname, "../../../../..");

function readMigration(name: string): string {
  return readFileSync(join(repoRoot, "supabase/migrations", name), "utf8");
}

describe("Launch readiness regressions", () => {
  it("803 reconciliation gate excludes unshadowed finance types", () => {
    const sql = readMigration("803_finance_reconciliation_and_stripe_ledger.sql");
    expect(sql).toContain("provider_earnings");
    expect(sql).toContain("gift_card_liability_reduction");
    expect(sql).toMatch(/transaction_type NOT IN/i);
  });

  it("804 shadow refund branches on refund_component", () => {
    const sql = readMigration("804_gl_shadow_refund_components.sql");
    expect(sql).toContain("refund_component");
    expect(sql).toContain("membership_discount");
  });

  it("recorded-takings excludes PayCloud tip booking_payments rows", () => {
    expect(
      isCardMachineTipBookingPayment({
        payment_provider_data: { tip: "true" },
        payment_provider_id: "pc-1",
      }),
    ).toBe(true);
    expect(
      isCardMachineTipBookingPayment({
        payment_provider_data: {},
        payment_provider_id: "abc:tip",
      }),
    ).toBe(true);
    expect(
      isCardMachineTipBookingPayment({
        payment_provider_data: {},
        payment_provider_id: "paystack-ref-1",
      }),
    ).toBe(false);
  });

  it("stripe-charge throws when booking payment record fails", () => {
    const src = readFileSync(
      join(repoRoot, "apps/web/src/app/api/payments/stripe/webhook/_handlers/stripe-charge.ts"),
      "utf8",
    );
    expect(src).toContain("throw new Error(`Failed to record Stripe booking payment");
    expect(src).toContain("recordBookingOnlineChargeLedger");
  });

  it("settle-paycloud-payment caps group allocations to captured amount", () => {
    const src = readFileSync(
      join(repoRoot, "apps/web/src/lib/payments/settle-paycloud-payment.ts"),
      "utf8",
    );
    expect(src).toMatch(/baseBudget|remainingBudget|input\.amount/);
  });

  it("802 scopes financial_period_locks and Yoco tables to service_role", () => {
    const sql = readMigration("802_launch_readiness_rls_hardening.sql");
    expect(sql).toContain("financial_period_locks");
    expect(sql).toContain("service_role");
    expect(sql).toContain("provider_yoco_webhook_events");
  });

  it("provider staff routes use staff_services not phantom staff_service_assignments", () => {
    for (const rel of [
      "apps/web/src/app/api/provider/staff/route.ts",
      "apps/web/src/app/api/provider/staff/[id]/route.ts",
      "apps/web/src/app/api/provider/staff/[id]/services/route.ts",
    ]) {
      const src = readFileSync(join(repoRoot, rel), "utf8");
      expect(src).not.toContain("staff_service_assignments");
      expect(src).toContain("staff_services");
    }
  });

  it("866 migration defines staff_earnings_lines and calendar_scope defaults", () => {
    const sql = readMigration("866_staff_permissions_scheduling_finance.sql");
    expect(sql).toContain("staff_earnings_lines");
    expect(sql).toContain("calendar_scope");
    expect(sql).toContain("get_receptionist_role_permissions");
  });

  it("protected provider finance/marketing routes use requirePermission", () => {
    for (const rel of [
      "apps/web/src/app/api/provider/payments/route.ts",
      "apps/web/src/app/api/provider/campaigns/route.ts",
      "apps/web/src/app/api/provider/promotions/route.ts",
      "apps/web/src/app/api/provider/staff/[id]/services/route.ts",
    ]) {
      const src = readFileSync(join(repoRoot, rel), "utf8");
      expect(src).toContain("requirePermission");
    }
  });

  it("findFutureBookingsForStaff helper exists for staff change guards", () => {
    const src = readFileSync(
      join(repoRoot, "apps/web/src/lib/provider/find-future-bookings-for-staff.ts"),
      "utf8",
    );
    expect(src).toContain("findFutureBookingsForStaff");
    expect(src).toContain("FUTURE_BOOKINGS_CONFLICT");
  });

  it("every api/cron route is listed in vercel.json and every scheduled cron has a handler", () => {
    const vercel = JSON.parse(
      readFileSync(join(repoRoot, "apps/web/vercel.json"), "utf8"),
    ) as { crons: Array<{ path: string; schedule: string }> };

    const cronAtom = /^(\*|\*\/[0-9]{1,2}|[0-9]{1,2}(-[0-9]{1,2})?(\/[0-9]{1,2})?)$/;
    const isValidCronField = (field: string) =>
      field.split(",").every((atom) => cronAtom.test(atom));

    const scheduledPaths = new Set(vercel.crons.map((cron) => cron.path));
    const cronRoot = join(repoRoot, "apps/web/src/app/api/cron");
    const handlerPaths = readdirSync(cronRoot, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(join(cronRoot, entry.name, "route.ts")),
      )
      .map((entry) => `/api/cron/${entry.name}`);

    for (const { path, schedule } of vercel.crons) {
      const parts = schedule.trim().split(/\s+/);
      expect(parts, `invalid cron schedule for ${path}: ${schedule}`).toHaveLength(5);
      expect(
        parts.every(isValidCronField),
        `invalid cron schedule for ${path}: ${schedule}`,
      ).toBe(true);
    }

    for (const path of scheduledPaths) {
      expect(
        existsSync(join(repoRoot, "apps/web/src/app", path, "route.ts")),
        `missing handler for scheduled cron ${path}`,
      ).toBe(true);
    }

    for (const path of handlerPaths) {
      expect(scheduledPaths.has(path), `cron handler not scheduled in vercel.json: ${path}`).toBe(
        true,
      );
    }
  });

  it("workflow_runs migration defines run registry for Part N", () => {
    const sql = readMigration("865_workflow_runs.sql");
    expect(sql).toContain("workflow_runs");
    expect(sql).toContain("run_id");
    expect(sql).toMatch(/idx_workflow_runs_active_domain/i);
  });

  it("Amplitude client track goes through pipeline only (no direct amplitude.track)", () => {
    const src = readFileSync(
      join(repoRoot, "apps/web/src/lib/analytics/amplitude/client.ts"),
      "utf8",
    );
    const trackFn = src.match(/track:\s*async[\s\S]*?\n    \},/);
    expect(trackFn?.[0] ?? "").not.toMatch(/amplitude\.track\(/);
    expect(src).toContain("pipeline.execute");
  });

  it("Gemini client sends responseSchema and uses request timeout", () => {
    const src = readFileSync(join(repoRoot, "apps/web/src/lib/ai/gemini.ts"), "utf8");
    expect(src).toContain("responseSchema");
    expect(src).toContain("AbortSignal.timeout");
  });

  it("trackServer supports insert_id dedup for revenue events", () => {
    const src = readFileSync(
      join(repoRoot, "apps/web/src/lib/analytics/amplitude/server.ts"),
      "utf8",
    );
    expect(src).toContain("insert_id");
    expect(src).toContain("TrackServerOptions");
  });

  it("cron_runs migration defines execution log table", () => {
    const sql = readMigration("864_cron_runs_and_lock.sql");
    expect(sql).toContain("cron_runs");
    expect(sql).toContain("claim_cron_run");
  });

  it("proxy matcher excludes Vercel Workflow control plane routes", () => {
    const src = readFileSync(join(repoRoot, "apps/web/src/proxy.ts"), "utf8");
    expect(src).toContain(".well-known/workflow/");
    expect(src).toContain("pathname.startsWith('/.well-known/workflow/')");
  });

  it("turbo caches generated workflow routes for web#build", () => {
    const turbo = JSON.parse(readFileSync(join(repoRoot, "turbo.json"), "utf8"));
    const outputs: string[] = turbo.tasks["web#build"].outputs;
    expect(outputs.some((entry) => entry.includes(".well-known/workflow"))).toBe(true);
  });

  it("every cron route imports the lock helper and exports maxDuration", () => {
    const cronRoot = join(repoRoot, "apps/web/src/app/api/cron");
    const dirs = readdirSync(cronRoot, { withFileTypes: true }).filter(
      (entry) => entry.isDirectory() && existsSync(join(cronRoot, entry.name, "route.ts")),
    );
    expect(dirs.length).toBeGreaterThan(10);
    for (const entry of dirs) {
      const src = readFileSync(join(cronRoot, entry.name, "route.ts"), "utf8");
      expect(
        /import\s+\{[^}]*\b(runLockedCronRoute|withCronLock)\b/.test(src) ||
          src.includes('from "@/lib/cron/locked-cron-route"') ||
          src.includes('from "@/lib/cron/with-cron-lock"'),
        `${entry.name} must import the cron lock helper`,
      ).toBe(true);
      expect(
        src.includes("withCronLock") || src.includes("runLockedCronRoute"),
        `${entry.name} must use withCronLock or runLockedCronRoute`,
      ).toBe(true);
      expect(src, `${entry.name} must export maxDuration`).toMatch(/export const maxDuration/);
    }
  });

  it("auth-sensitive public routes set Cache-Control no-store", () => {
    for (const rel of [
      "apps/web/src/app/api/public/booking-holds/route.ts",
      "apps/web/src/app/api/public/booking-holds/[id]/route.ts",
      "apps/web/src/app/api/public/booking-holds/[id]/consume/route.ts",
      "apps/web/src/app/api/public/gift-cards/validate/route.ts",
      "apps/web/src/app/api/public/ads/event/route.ts",
    ]) {
      const src = readFileSync(join(repoRoot, rel), "utf8");
      expect(src, rel).toMatch(/no-store|withNoStore/);
    }
  });

  it("PSP webhook routes export maxDuration of at least 30s", () => {
    for (const rel of [
      "apps/web/src/app/api/payments/webhook/route.ts",
      "apps/web/src/app/api/payments/stripe/webhook/route.ts",
      "apps/web/src/app/api/payments/flutterwave/webhook/route.ts",
      "apps/web/src/app/api/provider/yoco/webhook/route.ts",
      "apps/web/src/app/api/provider/paycloud/webhook/route.ts",
      "apps/web/src/app/api/webhooks/apple/notifications/route.ts",
      "apps/web/src/app/api/webhooks/paystack/route.ts",
    ]) {
      const src = readFileSync(join(repoRoot, rel), "utf8");
      const match = src.match(/export const maxDuration\s*=\s*(\d+)/);
      expect(match, `${rel} must export maxDuration`).toBeTruthy();
      expect(Number(match?.[1]), rel).toBeGreaterThanOrEqual(30);
    }
  });

  it("support ticket create routes gate triage behind isWorkflowFamilyEnabled(agent)", () => {
    for (const rel of [
      "apps/web/src/app/api/me/support-tickets/route.ts",
      "apps/web/src/app/api/provider/support-tickets/route.ts",
    ]) {
      const src = readFileSync(join(repoRoot, rel), "utf8");
      expect(src).toContain("startSupportTriageForTicket");
    }
    const starter = readFileSync(
      join(repoRoot, "apps/web/src/workflows/start-support-triage.ts"),
      "utf8",
    );
    expect(starter).toContain('isWorkflowFamilyEnabled("agent")');
  });
});
