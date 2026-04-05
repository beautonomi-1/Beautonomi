/**
 * k6 Load Test — Provider calendar/dashboard reads
 *
 * Env:
 *  - BASE_URL (default: http://localhost:3000)
 *  - AUTH_TOKEN (required; provider/staff JWT)
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

const failRate = new Rate("failed_requests");
const calendarDuration = new Trend("provider_calendar_duration", true);
const dashboardDuration = new Trend("provider_dashboard_duration", true);

export const options = {
  stages: [
    { duration: "1m", target: 40 },
    { duration: "4m", target: 80 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    failed_requests: ["rate<0.03"],
    provider_calendar_duration: ["p(95)<900", "p(99)<1500"],
    provider_dashboard_duration: ["p(95)<1000", "p(99)<1600"],
  },
};

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${AUTH_TOKEN}`,
  };
}

function formatDate(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0];
}

export default function () {
  if (!AUTH_TOKEN) {
    failRate.add(true);
    sleep(0.5);
    return;
  }

  const startDate = formatDate(-1);
  const endDate = formatDate(7);

  const calendarRes = http.get(
    `${BASE_URL}/api/provider/bookings?start_date=${startDate}&end_date=${endDate}&limit=100&sort=scheduled_at`,
    { headers: headers(), tags: { step: "provider_calendar" } },
  );
  calendarDuration.add(calendarRes.timings.duration);
  const calendarOk = check(calendarRes, {
    "calendar: status 200": (r) => r.status === 200,
    "calendar: < 1.5s": (r) => r.timings.duration < 1500,
  });
  failRate.add(!calendarOk);

  const dashboardRes = http.get(`${BASE_URL}/api/provider/dashboard`, {
    headers: headers(),
    tags: { step: "provider_dashboard" },
  });
  dashboardDuration.add(dashboardRes.timings.duration);
  const dashboardOk = check(dashboardRes, {
    "dashboard: status 200": (r) => r.status === 200,
    "dashboard: < 1.6s": (r) => r.timings.duration < 1600,
  });
  failRate.add(!dashboardOk);

  sleep(0.3);
}
