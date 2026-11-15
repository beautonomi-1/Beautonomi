import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("in-flight renewal charges", () => {
  it("waits for the webhook instead of counting the charge as failed", () => {
    const root = path.join(__dirname, "..", "..", "..");
    const membership = readFileSync(
      path.join(root, "app/api/cron/process-membership-renewals/route.ts"),
      "utf8",
    );
    const dunning = readFileSync(
      path.join(root, "app/api/cron/retry-subscription-payments/route.ts"),
      "utf8",
    );
    const flutterwave = readFileSync(
      path.join(root, "app/api/cron/process-flutterwave-subscription-renewals/route.ts"),
      "utf8",
    );

    expect(membership).toMatch(/chargePending = stripeOffSessionStillOpen\(intent\.status\)/);
    const paymentSavedAt = membership.indexOf("membership payment was not recorded");
    const periodAt = membership.lastIndexOf("expires_at: periodEnd.toISOString()");
    const orderStampAt = membership.lastIndexOf("membership_order_id: renewalOrder.id");
    expect(paymentSavedAt).toBeGreaterThan(-1);
    expect(periodAt).toBeGreaterThan(paymentSavedAt);
    expect(orderStampAt).toBeGreaterThan(periodAt);
    expect(membership).toMatch(/chargePending = fw\.ok === false && fw\.pending === true/);
    expect(dunning).toMatch(/outcome === "still_open"/);
    expect(dunning).toMatch(/fw\.ok === false && fw\.pending/);
    expect(dunning).toMatch(/if \(chargeCaptured\)/);
    expect(dunning).toMatch(/status: "active"[\s\S]{0,240}expires_at: periodEnd/);
    expect(dunning).toMatch(/next_payment_date: periodEnd/);
    expect(dunning).toMatch(/if \(!payment\.recorded && !payment\.alreadyRecorded\)/);
    expect(dunning).toMatch(/capturedRenewalAccess\(/);
    expect(dunning).toMatch(/billing_period_start: capturedAccess\.periodStart/);
    const capturedAt = dunning.indexOf("charge_captured: true");
    const dueAt = dunning.indexOf("dunningChargeIsDue(");
    expect(capturedAt).toBeGreaterThan(-1);
    expect(dueAt).toBeGreaterThan(capturedAt);
    expect(flutterwave).toMatch(/charged\.pending/);
    expect(flutterwave).toMatch(/status", "pending"/);
    expect(flutterwave).toMatch(/status: "past_due"/);
    expect(flutterwave).toMatch(/past_due_since: nowIso/);
    expect(flutterwave).toMatch(/last_dunning_retry_at: nowIso/);
    expect(flutterwave).toMatch(
      /if \(!payment\.recorded && !payment\.alreadyRecorded\)[\s\S]*?\.eq\("billing_provider", "flutterwave"\)[\s\S]*?if \(!opened\?\.length\)[\s\S]*?markOnlinePaymentCheckoutStatus\(reference, "paid"\)/,
    );
    expect(flutterwave.indexOf("inflightMeta.charge_captured === true")).toBeGreaterThan(-1);
    expect(flutterwave.indexOf("inflightMeta.charge_captured === true")).toBeLessThan(
      flutterwave.indexOf('generateTransactionReference("sub_flw_renew"'),
    );
    const stripeRenewal = readFileSync(
      path.join(root, "app/api/cron/process-stripe-subscription-renewals/route.ts"),
      "utf8",
    );
    expect(stripeRenewal).toMatch(/stripeOffSessionStillOpen\(intent\.status\)/);
    expect(stripeRenewal).toMatch(/code === "authentication_required"/);
    expect(stripeRenewal).toMatch(/if \(intentSucceeded\)/);
    expect(stripeRenewal).toMatch(/status: "past_due", past_due_since: nowIso/);
    expect(stripeRenewal).toMatch(
      /if \(!payment\.recorded && !payment\.alreadyRecorded\)[\s\S]*?\.eq\("billing_provider", "stripe"\)[\s\S]*?if \(!opened\?\.length\)[\s\S]*?markOnlinePaymentCheckoutStatus\(reference, "paid"\)/,
    );
    expect(stripeRenewal.indexOf("inflightMeta.charge_captured === true")).toBeGreaterThan(-1);
    expect(stripeRenewal.indexOf("inflightMeta.charge_captured === true")).toBeLessThan(
      stripeRenewal.indexOf('generateTransactionReference("sub_stripe_renew"'),
    );
    const failedCharge = readFileSync(
      path.join(root, "app/api/payments/webhook/_handlers/charge-success.ts"),
      "utf8",
    );
    expect(failedCharge).toMatch(/kind === "subscription_renewal"/);
    expect(failedCharge).toMatch(/markOnlinePaymentCheckoutStatus\(String\(reference\), "failed"\)/);
    expect(failedCharge).toMatch(
      /kind === "subscription_renewal"[\s\S]{0,900}status: "past_due"/,
    );
    const orderFn = failedCharge.slice(
      failedCharge.indexOf("async function handleProviderSubscriptionOrderSuccess"),
      failedCharge.indexOf("async function handleSubscriptionRenewalChargeSuccess"),
    );
    expect(orderFn.indexOf('kind: "provider_subscription_order"')).toBeGreaterThan(-1);
    expect(orderFn.indexOf('kind: "provider_subscription_order"')).toBeLessThan(
      orderFn.indexOf('status: "paid"'),
    );
    expect(orderFn).toMatch(/subscription payment was not recorded/);
    expect(orderFn).toMatch(/checkoutGrantAlreadyApplied/);
    expect(failedCharge).toMatch(/authorizationPayment\.recorded && !authorizationPayment\.alreadyRecorded/);
    const authFn = failedCharge.slice(
      failedCharge.indexOf("async function handleSubscriptionAuthorizationSuccess"),
      failedCharge.indexOf("// ─── Pay remaining balance"),
    );
    expect(authFn).toMatch(/start_date: paidAccessEnd/);
    expect(authFn).toMatch(/tenantId: subscriptionAuthTenantId/);
    expect(authFn).toMatch(/expires_at: accessEnd/);
    expect(authFn).toMatch(/billing_period_start: periodStart/);
    expect(authFn).toMatch(/billing_period_end: accessEnd/);
  });
});
