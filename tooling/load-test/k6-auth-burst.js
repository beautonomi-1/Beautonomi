/**
 * k6 Load Test — Auth/bootstrap burst
 *
 * Validates session/bootstrap behavior during sudden login-like traffic.
 *
 * Env:
 *  - BASE_URL (default: http://localhost:3000)
 *  - AUTH_TOKEN (optional; if omitted, public bootstrap endpoint is used)
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

const failRate = new Rate("failed_requests");
const bootstrapDuration = new Trend("auth_bootstrap_duration", true);

export const options = {
  stages: [
    { duration: "30s", target: 100 },
    { duration: "2m", target: 200 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    failed_requests: ["rate<0.02"],
    auth_bootstrap_duration: ["p(95)<800", "p(99)<1200"],
    http_req_duration: ["p(95)<1200"],
  },
};

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  return headers;
}

export default function () {
  const path = AUTH_TOKEN ? "/api/me/profile" : "/api/public/analytics-config";
  const res = http.get(`${BASE_URL}${path}`, {
    headers: buildHeaders(),
    tags: { step: "auth_bootstrap" },
  });

  bootstrapDuration.add(res.timings.duration);
  const ok = check(res, {
    "bootstrap: status ok": (r) => (AUTH_TOKEN ? r.status === 200 : r.status >= 200 && r.status < 300),
    "bootstrap: < 1.2s": (r) => r.timings.duration < 1200,
  });
  failRate.add(!ok);

  sleep(0.2);
}
