#!/usr/bin/env node
/**
 * Drive Paystack test-mode money through the staging app and record expected
 * metric deltas. Refuses any host that is not the staging project.
 *
 * Required:
 *   SUPABASE_URL containing byfzhyqvtbasxptxdupf
 *   SUPABASE_SERVICE_ROLE_KEY
 *   PAYSTACK_SECRET_KEY starting with sk_test_
 *   SEED_APP_ORIGIN default https://staging.beautonomi.com
 *
 * Optional:
 *   SEED_RUN_ID          reuse the same id to stay idempotent
 *   SEED_ALLOW_SKIP=1    write a skip manifest and exit 0 when a test key is absent
 *
 * Gateway amounts are never invented. Expected fees come from Paystack verify.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STAGING_REF = "byfzhyqvtbasxptxdupf";
const SCENARIOS = [
  "full_payment_completed",
  "deposit_then_remainder",
  "tip",
  "at_home_travel_fee",
  "partial_refund",
  "full_refund",
  "cancellation_fee_retained",
  "wallet_topup_then_wallet_booking",
  "gift_card_sale_and_redemption",
  "product_order_paid_then_refunded",
  "provider_subscription",
  "ads_purchase",
  "paystack_test_transfer",
];

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../audit/out");

function writeManifest(manifest) {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `seed-manifest-${manifest.run_id}.json`);
  writeFileSync(path, JSON.stringify(manifest, null, 2));
  console.log(`wrote ${path}`);
}

function assertStaging() {
  const url = process.env.SUPABASE_URL || "";
  const origin = process.env.SEED_APP_ORIGIN || "https://staging.beautonomi.com";
  if (!url.includes(STAGING_REF)) {
    throw new Error("SUPABASE_URL is not the staging project. Refusing to seed.");
  }
  if (!origin.includes("staging.beautonomi.com")) {
    throw new Error("SEED_APP_ORIGIN is not staging. Refusing to seed.");
  }
  return origin;
}

async function paystack(path, body) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const response = await fetch(`https://api.paystack.co${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok || payload.status === false) {
    const message = payload?.message || response.statusText;
    throw new Error(`Paystack ${path} failed: ${message}`);
  }
  return payload.data;
}

async function main() {
  const origin = assertStaging();
  const runId = process.env.SEED_RUN_ID || `seed-${new Date().toISOString().slice(0, 10)}`;
  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  const manifest = {
    run_id: runId,
    host: origin,
    project_ref: STAGING_REF,
    commission_note: "Enable 10% only on the dedicated seed provider override. Do not turn commission on globally.",
    scenarios: [],
  };

  if (!secret.startsWith("sk_test_")) {
    manifest.scenarios = SCENARIOS.map((id) => ({
      id,
      status: "skipped",
      reason: "PAYSTACK_SECRET_KEY is missing or is not a test key. No charges were sent.",
    }));
    writeManifest(manifest);
    if (process.env.SEED_ALLOW_SKIP === "1") return;
    throw new Error("Refusing to invent gateway amounts without a Paystack test key.");
  }

  const reference = `seed_${runId}_probe`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 80);
  const initialized = await paystack("/transaction/initialize", {
    email: "seed-money-flows@staging.beautonomi.com",
    amount: 10000,
    currency: "ZAR",
    reference,
    metadata: { seed_run_id: runId, scenario: "gateway_probe" },
  });
  const verified = await paystack(`/transaction/verify/${encodeURIComponent(initialized.reference)}`);
  manifest.scenarios.push({
    id: "gateway_probe",
    status: verified.status === "success" ? "verified" : "initialized_unpaid",
    reference: initialized.reference,
    paystack_status: verified.status,
    fee_major: Number(verified.fees ?? 0) / 100,
    note: "Initialize plus verify only. A successful card charge still requires the test card, PIN, and OTP on the authorization URL.",
    authorization_url_present: Boolean(initialized.authorization_url),
  });
  for (const id of SCENARIOS) {
    manifest.scenarios.push({
      id,
      status: "skipped",
      reason: "Needs a signed-in staging customer and the app booking, refund, wallet, gift card, subscription, ads, or transfer API. The probe above confirms the test key and records the Paystack fee only after a successful charge.",
    });
  }
  writeManifest(manifest);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
