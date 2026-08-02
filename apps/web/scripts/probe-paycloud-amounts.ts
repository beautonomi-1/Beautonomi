/**
 * Format probe — logs what the PayCloud client sends after ZAR decimal formatting.
 * Run: npx tsx scripts/probe-paycloud-amounts.ts
 */
import {
  buildCreatePaycloudOrderBusinessParams,
  createPaycloudOrder,
} from "../src/lib/payments/paycloud-client";
import { PAYCLOUD_SANDBOX_FIXTURES as F } from "../src/lib/payments/paycloud-sandbox-fixtures";
import { buildMerchantOrderNo } from "../src/lib/payments/paycloud";

const creds = {
  app_id: F.app_id,
  app_rsa_private_key: F.app_rsa_private_key_pkcs8,
  gateway_rsa_public_key: F.gateway_rsa_public_key,
  api_base_url: F.api_base_url,
};

const notify = "https://app.beautonomi.com/api/provider/paycloud/webhook";

/** Major-unit inputs (rands) — client formats to two-decimal strings for Cloud API. */
const cases: Array<{ label: string; amount: number; pay_method_id?: string }> = [
  { label: "R10", amount: 10 },
  { label: "R50 (UAT verified)", amount: 50 },
  { label: "R100", amount: 100 },
  { label: "R10 + Visa pay_method_id", amount: 10, pay_method_id: "Visa" },
];

async function main() {
  for (const c of cases) {
    const orderNo = buildMerchantOrderNo("A");
    const business = buildCreatePaycloudOrderBusinessParams({
      merchant_no: F.merchant_no,
      store_no: F.store_no,
      terminal_sn: F.terminal_sn,
      merchant_order_no: orderNo,
      order_amount: c.amount,
      price_currency: "ZAR",
      pay_scenario: "SWIPE_CARD",
      pay_method_id: c.pay_method_id,
      notify_url: notify,
      description: c.label,
    });
    const r = await createPaycloudOrder("sandbox", creds, {
      merchant_no: F.merchant_no,
      store_no: F.store_no,
      terminal_sn: F.terminal_sn,
      merchant_order_no: orderNo,
      order_amount: c.amount,
      price_currency: "ZAR",
      pay_scenario: "SWIPE_CARD",
      pay_method_id: c.pay_method_id,
      notify_url: notify,
      description: c.label,
    });
    let data: Record<string, unknown> | null = null;
    const rawData = r.raw.data;
    if (typeof rawData === "string") {
      try {
        data = JSON.parse(rawData) as Record<string, unknown>;
      } catch {
        data = null;
      }
    } else if (rawData && typeof rawData === "object") {
      data = rawData as Record<string, unknown>;
    }
    console.log("---", c.label);
    console.log(" input (major):", c.amount, "| api order_amount:", business.order_amount);
    console.log(" success:", r.success, "| code:", r.response_code);
    console.log(" trans_amount:", data?.trans_amount, "| order:", orderNo);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

main().catch(console.error);
