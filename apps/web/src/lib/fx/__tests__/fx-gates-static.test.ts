import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "../../../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("FX charge gates", () => {
  const gatedPaths = [
    "apps/web/src/app/api/payments/initialize/route.ts",
    "apps/web/src/app/api/public/bookings/_helpers/process-payment.ts",
    "apps/web/src/app/api/public/gift-cards/purchase/route.ts",
    "apps/web/src/app/api/provider/subscription/initialize-payment/route.ts",
    "apps/web/src/app/api/paystack/initialize/route.ts",
  ];

  it.each(gatedPaths)("%s calls assertReportingCurrencyReady", (rel) => {
    const src = read(rel);
    expect(src).toContain("assertReportingCurrencyReady");
    expect(src).toMatch(/503|FX_REPORTING_NOT_READY/);
  });
});

describe("Slack finance.fx.stale label", () => {
  it("is registered in admin Slack integration page", () => {
    const src = read("apps/admin-web/src/routes/integrations/SlackIntegrationPage.tsx");
    expect(src).toContain('"finance.fx.stale"');
  });
});

describe("Stripe PSP boundary", () => {
  it("stores exchange_rate on payment metadata only", () => {
    const stripePayment = read("apps/web/src/lib/bookings/record-booking-stripe-payment.ts");
    expect(stripePayment).toContain("stripe_balance_exchange_rate");
    const ingest = read("apps/web/src/lib/fx/ingest-reference-rates.ts");
    expect(ingest).not.toContain("stripe");
  });
});
