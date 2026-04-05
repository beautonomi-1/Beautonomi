/**
 * k6 Load Test — Mixed journey soak
 *
 * Long-running mixed traffic profile (search/profile/availability/hold + provider reads).
 *
 * Env:
 *  - BASE_URL (default: http://localhost:3000)
 *  - AUTH_TOKEN (optional; enables provider read steps)
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

const failRate = new Rate("failed_requests");
const mixedDuration = new Trend("mixed_request_duration", true);

export const options = {
  stages: [
    { duration: "10m", target: 40 },
    { duration: "60m", target: 40 },
    { duration: "5m", target: 0 },
  ],
  thresholds: {
    failed_requests: ["rate<0.03"],
    mixed_request_duration: ["p(95)<1300", "p(99)<2200"],
  },
};

function authHeaders() {
  const h = { "Content-Type": "application/json" };
  if (AUTH_TOKEN) h.Authorization = `Bearer ${AUTH_TOKEN}`;
  return h;
}

function dayIso(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

export default function () {
  const search = http.get(`${BASE_URL}/api/public/search?category=hair&city=cape-town&page=1&limit=8`, {
    headers: authHeaders(),
    tags: { step: "public_search" },
  });
  mixedDuration.add(search.timings.duration);
  const searchOk = check(search, { "search ok": (r) => r.status === 200 });
  failRate.add(!searchOk);

  let providerId = null;
  try {
    const body = JSON.parse(search.body);
    const list = body?.data || body?.results || body;
    if (Array.isArray(list) && list.length > 0) providerId = list[0]?.id || list[0]?.provider_id || null;
  } catch {
    providerId = null;
  }

  if (providerId) {
    const profile = http.get(`${BASE_URL}/api/public/providers/${providerId}`, {
      headers: authHeaders(),
      tags: { step: "provider_profile" },
    });
    mixedDuration.add(profile.timings.duration);
    failRate.add(!(profile.status >= 200 && profile.status < 300));

    const availability = http.get(`${BASE_URL}/api/public/providers/${providerId}/availability?date=${dayIso(1).split("T")[0]}`, {
      headers: authHeaders(),
      tags: { step: "availability" },
    });
    mixedDuration.add(availability.timings.duration);
    failRate.add(!(availability.status >= 200 && availability.status < 300));

    const hold = http.post(
      `${BASE_URL}/api/public/booking-holds`,
      JSON.stringify({
        provider_id: providerId,
        services: [{ offering_id: "00000000-0000-0000-0000-000000000000" }],
        start_at: dayIso(1),
        end_at: dayIso(1),
        location_type: "at_salon",
      }),
      { headers: authHeaders(), tags: { step: "booking_hold" } },
    );
    mixedDuration.add(hold.timings.duration);
    // Hold may return validation conflict depending on data setup; keep as non-failing telemetry call.
  }

  if (AUTH_TOKEN) {
    const providerBookings = http.get(
      `${BASE_URL}/api/provider/bookings?start_date=${dayIso(-1).split("T")[0]}&end_date=${dayIso(7).split("T")[0]}&limit=50`,
      { headers: authHeaders(), tags: { step: "provider_bookings_read" } },
    );
    mixedDuration.add(providerBookings.timings.duration);
    failRate.add(!(providerBookings.status >= 200 && providerBookings.status < 300));
  }

  sleep(0.5);
}
