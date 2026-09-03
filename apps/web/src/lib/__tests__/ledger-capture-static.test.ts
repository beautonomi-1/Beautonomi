/**
 * Part A (ledger capture) static regressions.
 *
 * Every in-process Paystack capture must go through `recordPaystackBookingSettlement`
 * (money is captured in-process; the webhook and the reconcile cron are retries, not
 * the only writers). These checks read the source so a refactor that drops a call
 * site fails CI without a live DB.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "../../../../..");
const webSrc = join(repoRoot, "apps/web/src");

function readWeb(relative: string): string {
  return readFileSync(join(webSrc, relative), "utf8");
}

const SETTLEMENT_IMPORT = /import\s*\{[^}]*\brecordPaystackBookingSettlement\b[^}]*\}\s*from\s*["']@\/lib\/bookings\/record-paystack-booking-settlement["']/;
const SETTLEMENT_CALL = /\brecordPaystackBookingSettlement\s*\(/;

const PAYSTACK_CAPTURE_SITES: Array<{ label: string; path: string }> = [
  {
    label: "public booking saved-card charge",
    path: "app/api/public/bookings/_helpers/process-payment.ts",
  },
  {
    label: "charge-saved-card route",
    path: "app/api/payments/charge-saved-card/route.ts",
  },
  {
    label: "Paystack terminal allocation route",
    path: "app/api/provider/paystack/terminal-payments/[id]/allocation/route.ts",
  },
  {
    label: "Paystack terminal provider mobile API",
    path: "lib/payments/paystack-terminal-provider-mobile-api.ts",
  },
  {
    label: "admin Paystack terminal payments route",
    path: "app/api/admin/paystack-terminal/payments/[id]/route.ts",
  },
];

describe("Ledger capture: every in-process Paystack capture posts the ledger", () => {
  for (const site of PAYSTACK_CAPTURE_SITES) {
    it(`${site.label} imports and calls recordPaystackBookingSettlement`, () => {
      const src = readWeb(site.path);
      expect(src).toMatch(SETTLEMENT_IMPORT);
      expect(src).toMatch(SETTLEMENT_CALL);
    });
  }

  it("saved-card branch in process-payment passes isDeposit from isDepositPayment", () => {
    const src = readWeb("app/api/public/bookings/_helpers/process-payment.ts");
    const savedCardIdx = src.indexOf("process_payment_saved_card");
    const settlementIdx = src.indexOf("recordPaystackBookingSettlement(");
    expect(savedCardIdx).toBeGreaterThan(-1);
    expect(settlementIdx).toBeGreaterThan(-1);
    // The settlement call lives in the saved-card branch and forwards the deposit flag.
    const branch = src.slice(settlementIdx, settlementIdx + 1500);
    expect(branch).toMatch(/isDeposit:\s*isDepositPayment/);
  });

  it("terminal allocation uses provider_collected commission mode (card-machine money takes no commission)", () => {
    const src = readWeb("app/api/provider/paystack/terminal-payments/[id]/allocation/route.ts");
    expect(src).toMatch(/commissionMode:\s*["']provider_collected["']/);
  });
});

describe("Ledger capture: writer and settlement helper contracts", () => {
  it("record-booking-online-charge-ledger supports commissionMode and sets currency on inserts", () => {
    const src = readWeb("lib/bookings/record-booking-online-charge-ledger.ts");
    expect(src).toContain("commissionMode");
    expect(src).toMatch(/export type CommissionMode\s*=\s*["']platform_settings["']\s*\|\s*["']provider_collected["']/);
    expect(src).toMatch(/commissionMode === "provider_collected"\s*\?\s*0/);
    // currency threaded through the shared row builder
    expect(src).toMatch(/currency \? \{ \.\.\.base, currency \} : base/);
  });

  it("settlement helper never throws and forwards sourcePaymentId + commissionMode", () => {
    const src = readWeb("lib/bookings/record-paystack-booking-settlement.ts");
    expect(src).toMatch(/reason:\s*["']unexpected_error["']/);
    expect(src).toMatch(/sourcePaymentId:\s*bookingPaymentId/);
    expect(src).toMatch(/commissionMode:\s*input\.commissionMode\s*\?\?\s*["']platform_settings["']/);
  });

  it("reconcile cron uses paystack_verify_reconcile fee source, has a fee-patch pass and log-only other gateways", () => {
    const src = readWeb("lib/bookings/reconcile-online-charge-ledger.ts");
    expect(src).toContain('feeSource: "paystack_verify_reconcile"');
    expect(src).toMatch(/BACKFILLED_FEE_SOURCES\s*=\s*\[\s*["']manual_backfill["'],\s*["']estimate["'],\s*["']estimated["']\s*\]/);
    expect(src).toContain("otherGatewaysMissing");
    expect(src).toContain('.in("payment_provider", ["stripe", "flutterwave"])');
    expect(src).toContain('from("reconciliation_exceptions")');
    expect(src).toContain("SLACK_EVENT_KEYS.FINANCE_RECONCILIATION_WARNING");
  });
});

describe("Ledger capture: cron schedule", () => {
  it("vercel.json schedules /api/cron/reconcile-online-charge-ledger every 15 minutes", () => {
    const vercel = JSON.parse(readFileSync(join(repoRoot, "apps/web/vercel.json"), "utf8")) as {
      crons?: Array<{ path: string; schedule: string }>;
    };
    const cron = (vercel.crons ?? []).find((c) => c.path === "/api/cron/reconcile-online-charge-ledger");
    expect(cron).toBeDefined();
    expect(cron?.schedule).toBe("*/15 * * * *");
  });

  it("reconcile cron route is CRON_SECRET-gated, lock-protected and alerts on failure", () => {
    const src = readWeb("app/api/cron/reconcile-online-charge-ledger/route.ts");
    expect(src).toContain("verifyCronRequest");
    expect(src).toContain("withCronLock");
    expect(src).toContain("slackNotifyCronJobFailed");
    expect(src).toContain("reconcileOnlineChargeLedger(");
  });
});

describe("Ledger capture: webhook signature rejections are persisted", () => {
  const WEBHOOK_ROUTES: Array<{ source: "paystack" | "stripe" | "flutterwave"; path: string }> = [
    { source: "paystack", path: "app/api/payments/webhook/route.ts" },
    { source: "stripe", path: "app/api/payments/stripe/webhook/route.ts" },
    { source: "flutterwave", path: "app/api/payments/flutterwave/webhook/route.ts" },
  ];

  for (const route of WEBHOOK_ROUTES) {
    it(`${route.source} webhook route calls persistFailedWebhookSignature with source "${route.source}"`, () => {
      const src = readWeb(route.path);
      expect(src).toMatch(
        /import\s*\{[^}]*\bpersistFailedWebhookSignature\b[^}]*\}\s*from\s*["']@\/lib\/payment\/persist-failed-webhook-signature["']/,
      );
      const callIdx = src.indexOf("persistFailedWebhookSignature(");
      expect(callIdx).toBeGreaterThan(-1);
      const call = src.slice(callIdx, callIdx + 600);
      expect(call).toMatch(new RegExp(`source:\\s*["']${route.source}["']`));
    });
  }

  it("persistFailedWebhookSignature upserts on (event_id, source) with a sigfail: sha256 id", () => {
    const src = readWeb("lib/payment/persist-failed-webhook-signature.ts");
    expect(src).toContain("sigfail:");
    expect(src).toContain('createHash("sha256")');
    expect(src).toContain('onConflict: "event_id,source"');
    expect(src).toContain('event_type: "signature_rejected"');
  });
});

describe("Ledger capture: repair script guards", () => {
  it("repair SQL resolves commission from platform_settings payouts + provider override, posts tax, and raises on imbalance", () => {
    const sql = readFileSync(join(repoRoot, "scripts/repair-missing-online-charge-ledger.sql"), "utf8");
    expect(sql).toMatch(/platform_settings/);
    expect(sql).toMatch(/settings->'payouts'/);
    expect(sql).toMatch(/commission_enabled/);
    expect(sql).toMatch(/commission_override/);
    expect(sql).not.toMatch(/tenant_settings/);
    expect(sql).toMatch(/'tax',\s*v_tax,\s*0,\s*0,\s*0/);
    expect(sql).toMatch(/RAISE EXCEPTION 'Leg sum mismatch/);
    expect(sql).toMatch(/RAISE EXCEPTION 'GL journal imbalance/);
    expect(sql).toMatch(/journal_entries/);
    expect(sql).toMatch(/journal_lines/);
    expect(sql).toContain("payment_provider_response->'data'->>'fees'");
    expect(sql).toContain("6518600061");
    expect(sql).toContain("BTN-20260902-133730-540BED64");
  });
});
