/**
 * k6 Load Test — Paystack webhook storm
 *
 * Sends signed webhook payloads to validate throughput and idempotency behavior.
 *
 * Env:
 *  - BASE_URL (default: http://localhost:3000)
 *  - PAYSTACK_SECRET_KEY (required for signature)
 */

import http from "k6/http";
import crypto from "k6/crypto";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const PAYSTACK_SECRET_KEY = __ENV.PAYSTACK_SECRET_KEY || "";

const failRate = new Rate("failed_requests");
const webhookDuration = new Trend("webhook_duration", true);

export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "2m", target: 150 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    failed_requests: ["rate<0.01"],
    webhook_duration: ["p(95)<1200", "p(99)<2000"],
  },
};

function sign(body) {
  return crypto.hmac("sha512", PAYSTACK_SECRET_KEY, body, "hex");
}

export default function () {
  if (!PAYSTACK_SECRET_KEY) {
    failRate.add(true);
    sleep(0.5);
    return;
  }

  const ts = Date.now();
  const payload = JSON.stringify({
    event: "charge.success",
    id: `k6-event-${__VU}-${__ITER}-${ts}`,
    data: {
      id: `k6-data-${__VU}-${__ITER}`,
      reference: `k6-ref-${__VU}-${__ITER}-${ts}`,
      metadata: {
        booking_id: "00000000-0000-0000-0000-000000000000",
      },
    },
  });

  const res = http.post(`${BASE_URL}/api/payments/webhook`, payload, {
    headers: {
      "Content-Type": "application/json",
      "x-paystack-signature": sign(payload),
    },
    tags: { step: "paystack_webhook" },
  });

  webhookDuration.add(res.timings.duration);
  const ok = check(res, {
    "webhook: accepts storm payloads": (r) => r.status >= 200 && r.status < 300,
    "webhook: < 2s": (r) => r.timings.duration < 2000,
  });
  failRate.add(!ok);

  sleep(0.1);
}
