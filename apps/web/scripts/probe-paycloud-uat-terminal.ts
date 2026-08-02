/**
 * Live UAT terminal probe — mirrors provider app cloud-mode charge.
 * Run: npx tsx scripts/probe-paycloud-uat-terminal.ts [amount_in_rands]
 * PayCloud Cloud Mode sends ZAR in major units with 2 decimals (e.g. "10.00").
 */
import {
  buildPaycloudEntryUrl,
  closePaycloudOrder,
  createPaycloudOrder,
  queryPaycloudOrder,
} from "../src/lib/payments/paycloud-client";
import {
  formatPaycloudCredentialTestMessage,
  isPaycloudCredentialTestPassing,
} from "../src/lib/payments/paycloud-credential-test";
import { PAYCLOUD_SANDBOX_FIXTURES as F } from "../src/lib/payments/paycloud-sandbox-fixtures";
import { buildMerchantOrderNo } from "../src/lib/payments/paycloud";

const probeAmountMajor = Number(process.argv[2] ?? process.env.PAYCLOUD_PROBE_AMOUNT ?? "10");
if (!Number.isFinite(probeAmountMajor) || probeAmountMajor <= 0) {
  console.error("Usage: npx tsx scripts/probe-paycloud-uat-terminal.ts [amount_in_rands]");
  process.exit(1);
}
const creds = {
  app_id: F.app_id,
  app_rsa_private_key: F.app_rsa_private_key_pkcs8,
  gateway_rsa_public_key: F.gateway_rsa_public_key,
  api_base_url: F.api_base_url,
};

function parseDataField(raw: Record<string, unknown>): Record<string, unknown> | null {
  const data = raw.data;
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

async function main() {
  const gatewayQueryUrl = buildPaycloudEntryUrl(F.api_base_url, "orderquery");
  const gatewayOrderUrl = buildPaycloudEntryUrl(F.api_base_url, "ecrorder");

  console.log("PayCloud UAT terminal probe");
  console.log("=".repeat(60));
  console.log(`Gateway:     ${F.api_base_url}`);
  console.log(`App ID:      ${F.app_id}`);
  console.log(`Merchant:    ${F.merchant_no}`);
  console.log(`Store:       ${F.store_no}`);
  console.log(`Terminal SN: ${F.terminal_sn}`);
  console.log(`Amount:      R${probeAmountMajor.toFixed(2)} (sent as "${probeAmountMajor.toFixed(2)}" to API)`);
  console.log("");

  // Step 1 — credential probe (admin "Test sandbox credentials")
  const probeOrder = `beautonomi-probe-${Date.now()}`;
  console.log("1) Credential probe (orderquery)…");
  const query = await queryPaycloudOrder("sandbox", creds, F.merchant_no, probeOrder);
  const credsOk = isPaycloudCredentialTestPassing(query);
  console.log(`   URL:     ${gatewayQueryUrl}`);
  console.log(`   Pass:    ${credsOk ? "YES" : "NO"}`);
  console.log(`   Code:    ${query.response_code ?? "—"}`);
  console.log(`   Message: ${formatPaycloudCredentialTestMessage(query, gatewayQueryUrl)}`);
  console.log("");

  if (!credsOk) {
    console.error("Aborting — credentials not accepted by UAT gateway.");
    process.exit(1);
  }

  // Step 2 — create order (same as provider app POST /paycloud/payments cloud channel)
  const merchantOrderNo = buildMerchantOrderNo("BN");
  const notifyUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/provider/paycloud/webhook`
    : "https://app.beautonomi.com/api/provider/paycloud/webhook";

  console.log(`2) Create terminal charge (R${probeAmountMajor.toFixed(2)} SWIPE_CARD)…`);
  console.log(`   URL:           ${gatewayOrderUrl}`);
  console.log(`   Order no:      ${merchantOrderNo}`);
  console.log(`   Notify URL:    ${notifyUrl}`);
  const create = await createPaycloudOrder("sandbox", creds, {
    merchant_no: F.merchant_no,
    store_no: F.store_no,
    terminal_sn: F.terminal_sn,
    merchant_order_no: merchantOrderNo,
    order_amount: probeAmountMajor,
    price_currency: "ZAR",
    pay_scenario: "SWIPE_CARD",
    notify_url: notifyUrl,
    description: "Beautonomi UAT terminal probe",
    reject_trade_when_terminal_offline: true,
  });

  const data = parseDataField(create.raw);
  const terminalOnline = data?.terminal_online_status ?? "unknown";

  console.log(`   Success:       ${create.success ? "YES" : "NO"}`);
  console.log(`   Response code: ${create.response_code ?? "—"}`);
  console.log(`   Error:         ${create.error_message ?? "—"}`);
  console.log(`   Terminal:      ${terminalOnline}`);
  if (data) {
    console.log(`   Trans no:      ${data.trans_no ?? "—"}`);
    console.log(`   Message ID:    ${data.message_id ?? "—"}`);
    console.log(`   Amount:        ${data.trans_amount ?? "—"}`);
  }
  console.log("");

  if (!create.success) {
    console.error("Terminal charge FAILED — check merchant/store/terminal enrollment at PayCloud UAT.");
    console.log("Raw response:", JSON.stringify(create.raw, null, 2));
    process.exit(1);
  }

  console.log("SUCCESS — charge sent to terminal. Tap/insert card on the device now.");
  console.log("(Order stays open until paid or closed — cancelling probe order in 3s…)");
  await new Promise((r) => setTimeout(r, 3000));

  console.log("");
  console.log("3) Close probe order (ecrclose)…");
  const close = await closePaycloudOrder("sandbox", creds, {
    merchant_no: F.merchant_no,
    store_no: F.store_no,
    terminal_sn: F.terminal_sn,
    merchant_order_no: merchantOrderNo,
    description: "Beautonomi UAT probe cancel",
  });
  console.log(`   Closed:  ${close.success ? "YES" : "NO"}`);
  console.log(`   Code:    ${close.response_code ?? "—"}`);
  console.log(`   Message: ${close.error_message ?? close.raw?.msg ?? "—"}`);
  console.log("");
  console.log("All checks passed. UAT integration is working from this machine.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
