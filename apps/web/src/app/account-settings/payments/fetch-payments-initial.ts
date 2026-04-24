import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getPaymentMethods } from "@/app/api/me/payment-methods/route";
import { GET as getCouponCount } from "@/app/api/me/coupons/count/route";
import { GET as getPaymentSafetyCopy } from "@/app/api/public/payment-safety-copy/route";
import type { PaymentMethodRow, PaymentSafetyCopyInitial, PaymentsPageInitial } from "./payments-initial-types";

export async function fetchPaymentsPageInitial(): Promise<PaymentsPageInitial | null> {
  const [pmReq, ccReq, copyReq] = await Promise.all([
    createNextRequestFromHeaders("/api/me/payment-methods"),
    createNextRequestFromHeaders("/api/me/coupons/count"),
    createNextRequestFromHeaders("/api/public/payment-safety-copy"),
  ]);

  const [pmRes, ccRes, copyRes] = await Promise.all([
    getPaymentMethods(pmReq),
    getCouponCount(ccReq),
    getPaymentSafetyCopy(copyReq),
  ]);

  const pmJson = (await pmRes.json().catch(() => ({}))) as { data?: PaymentMethodRow[] };
  if (!pmRes.ok || !Array.isArray(pmJson.data)) {
    return null;
  }

  let couponCount = 0;
  if (ccRes.ok) {
    const ccJson = (await ccRes.json().catch(() => ({}))) as { data?: { count?: number } };
    couponCount = typeof ccJson.data?.count === "number" ? ccJson.data.count : 0;
  }

  let paymentSafetyCopy: PaymentSafetyCopyInitial | null = null;
  if (copyRes.ok) {
    const copyJson = (await copyRes.json().catch(() => ({}))) as { data?: PaymentSafetyCopyInitial };
    const d = copyJson.data;
    if (d && typeof d.title === "string" && typeof d.body === "string") {
      paymentSafetyCopy = {
        title: d.title,
        body: d.body,
        learn_more_url: d.learn_more_url ?? "/terms-and-condition",
        learn_more_label: d.learn_more_label ?? "Learn more",
      };
    }
  }

  return {
    paymentMethods: pmJson.data,
    couponCount,
    paymentSafetyCopy,
  };
}
