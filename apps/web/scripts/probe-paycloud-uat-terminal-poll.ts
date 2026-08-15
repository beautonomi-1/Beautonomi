/**
 * UAT probe: push charge then poll orderquery until paid, cancelled, or timeout.
 * Run: npx tsx scripts/probe-paycloud-uat-terminal-poll.ts [amount_in_rands]
 */
import {
  createPaycloudOrder,
  queryPaycloudOrder,
} from "../src/lib/payments/paycloud-client";
import { PAYCLOUD_SANDBOX_FIXTURES as F } from "../src/lib/payments/paycloud-sandbox-fixtures";
import { buildMerchantOrderNo, PAYCLOUD_TRANS_STATUS } from "../src/lib/payments/paycloud";

const probeAmountMajor = Number(process.argv[2] ?? process.env.PAYCLOUD_PROBE_AMOUNT ?? "10");
const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_ATTEMPTS = 18; // 90s

const STATUS_LABEL: Record<string, string> = {
  "9": "created (awaiting payment)",
  "0": "processing",
  "2": "completed / PAID",
  "3": "cancelled",
  "1": "closed",
};

const creds = {
  app_id: F.app_id,
  app_rsa_private_key: F.app_rsa_private_key_pkcs8,
  gateway_rsa_public_key: F.gateway_rsa_public_key,
  api_base_url: F.api_base_url,
};

function parseOrderQueryPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const data = raw.data;
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return raw;
    }
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { ...raw, ...(data as Record<string, unknown>) };
  }
  return raw;
}

async function main() {
  console.log("PayCloud UAT probe + payment poll");
  console.log("=".repeat(60));
  console.log(`Terminal SN: ${F.terminal_sn}`);
  console.log(`Amount:      R${probeAmountMajor.toFixed(2)}`);
  console.log("");

  const merchantOrderNo = buildMerchantOrderNo("BN");
  const notifyUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/provider/paycloud/webhook`
    : "https://app.beautonomi.com/api/provider/paycloud/webhook";

  console.log("1) Create terminal charge…");
  console.log(`   Order no: ${merchantOrderNo}`);
  const create = await createPaycloudOrder("sandbox", creds, {
    merchant_no: F.merchant_no,
    store_no: F.store_no,
    terminal_sn: F.terminal_sn,
    merchant_order_no: merchantOrderNo,
    order_amount: probeAmountMajor,
    price_currency: "ZAR",
    pay_scenario: "SWIPE_CARD",
    notify_url: notifyUrl,
    description: "Beautonomi UAT probe + poll",
    reject_trade_when_terminal_offline: true,
  });

  const createRaw = create.raw as Record<string, unknown>;
  console.log(`   Success:  ${create.success ? "YES" : "NO"}`);
  console.log(`   Terminal: ${createRaw.terminal_online_status ?? "unknown"}`);
  console.log(`   Trans no: ${createRaw.trans_no ?? "—"}`);
  console.log("");

  if (!create.success) {
    console.error("Charge failed:", create.error_message ?? JSON.stringify(create.raw, null, 2));
    process.exit(1);
  }

  console.log("SUCCESS — charge on terminal. Tap/insert card now.");
  console.log(`Polling order status every ${POLL_INTERVAL_MS / 1000}s (max ${(POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s)…\n`);

  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const query = await queryPaycloudOrder("sandbox", creds, F.merchant_no, merchantOrderNo);
    const raw = parseOrderQueryPayload(query.raw as Record<string, unknown>);
    const status = String(query.trans_status ?? raw.trans_status ?? "—");
    const label = STATUS_LABEL[status] ?? `unknown (${status})`;
    const paidAmount = raw.paid_amount ?? raw.trans_amount ?? "—";
    const errorCode = raw.trans_error_code ?? "";
    const errorMsg = raw.trans_error_msg ?? "";

    console.log(
      `[${attempt * (POLL_INTERVAL_MS / 1000)}s] trans_status=${status} (${label}) paid_amount=${paidAmount} code=${query.response_code ?? "—"}${errorMsg ? ` error=${errorCode} ${errorMsg}` : ""}`,
    );

    if (status === PAYCLOUD_TRANS_STATUS.COMPLETED) {
      console.log("\nRESULT: PAID — transaction completed on PayCloud.");
      console.log(`Order: ${merchantOrderNo}`);
      return;
    }
    if (status === PAYCLOUD_TRANS_STATUS.CANCELLED) {
      console.log("\nRESULT: NOT PAID — order was cancelled.");
      console.log(`Order: ${merchantOrderNo}`);
      return;
    }
  }

  const final = await queryPaycloudOrder("sandbox", creds, F.merchant_no, merchantOrderNo);
  const finalRaw = parseOrderQueryPayload(final.raw as Record<string, unknown>);
  const finalStatus = String(final.trans_status ?? finalRaw.trans_status ?? "—");
  const finalLabel = STATUS_LABEL[finalStatus] ?? `unknown (${finalStatus})`;
  const paid = Number(finalRaw.paid_amount ?? 0);
  console.log(`\nRESULT: ${paid > 0 && finalStatus === PAYCLOUD_TRANS_STATUS.COMPLETED ? "PAID" : "NOT PAID"} after ${(POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s — status: ${finalStatus} (${finalLabel})`);
  if (finalRaw.trans_error_msg) {
    console.log(`Error: [${finalRaw.trans_error_code}] ${finalRaw.trans_error_msg}`);
  }
  if (finalRaw.pay_method_id) {
    console.log(`Card: ${finalRaw.pay_method_id} ${finalRaw.pay_user_account_id ?? ""}`);
  }
  console.log(`Order: ${merchantOrderNo}`);
  console.log("Final order details:", JSON.stringify(finalRaw, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
