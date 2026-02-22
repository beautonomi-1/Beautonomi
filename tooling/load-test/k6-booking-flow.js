/**
 * k6 Load Test — Beautonomi Booking Flow
 *
 * Simulates the end-to-end customer booking journey:
 *   1. Search for providers
 *   2. View provider profile
 *   3. Check availability
 *   4. Create a booking hold
 *   5. Create the actual booking
 *
 * Run:
 *   k6 run tooling/load-test/k6-booking-flow.js
 *
 * Environment variables:
 *   BASE_URL — target host (default: http://localhost:3000)
 *   AUTH_TOKEN — optional Bearer token for authenticated endpoints
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ── Custom metrics ──────────────────────────────────────────────────────────
const failRate = new Rate("failed_requests");
const searchDuration = new Trend("search_duration", true);
const providerViewDuration = new Trend("provider_view_duration", true);
const availabilityDuration = new Trend("availability_duration", true);
const holdDuration = new Trend("hold_duration", true);
const bookingDuration = new Trend("booking_duration", true);

// ── Configuration ───────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

export const options = {
  stages: [
    { duration: "1m", target: 50 }, // ramp up to 50 VUs over 1 min
    { duration: "3m", target: 50 }, // sustain 50 VUs for 3 min
    { duration: "1m", target: 0 },  // ramp down over 1 min
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000"], // 95th percentile < 2s
    failed_requests: ["rate<0.1"],     // <10 % failure rate
    search_duration: ["p(95)<2000"],
    provider_view_duration: ["p(95)<2000"],
    availability_duration: ["p(95)<2000"],
    hold_duration: ["p(95)<2000"],
    booking_duration: ["p(95)<2000"],
  },
};

function headers() {
  const h = { "Content-Type": "application/json" };
  if (AUTH_TOKEN) {
    h["Authorization"] = `Bearer ${AUTH_TOKEN}`;
  }
  return h;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function randomCategory() {
  const categories = ["hair", "nails", "skin", "massage", "makeup"];
  return categories[Math.floor(Math.random() * categories.length)];
}

function randomCity() {
  const cities = ["johannesburg", "cape-town", "durban", "pretoria"];
  return cities[Math.floor(Math.random() * cities.length)];
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

// ── Test scenario ───────────────────────────────────────────────────────────

export default function () {
  const category = randomCategory();
  const city = randomCity();
  const date = tomorrow();

  // ──────── Step 1: Search ────────
  const searchRes = http.get(
    `${BASE_URL}/api/public/search?category=${category}&city=${city}&page=1&limit=10`,
    { headers: headers(), tags: { step: "search" } }
  );
  searchDuration.add(searchRes.timings.duration);
  const searchOk = check(searchRes, {
    "search: status 200": (r) => r.status === 200,
    "search: < 2 s": (r) => r.timings.duration < 2000,
  });
  failRate.add(!searchOk);

  // Parse a provider ID from the response (use first result)
  let providerId;
  try {
    const body = JSON.parse(searchRes.body);
    const results = body.data || body.results || body;
    if (Array.isArray(results) && results.length > 0) {
      providerId = results[0].id || results[0].provider_id;
    }
  } catch {
    // If parsing fails, use a placeholder
  }

  if (!providerId) {
    // Skip remaining steps if no provider found
    sleep(1);
    return;
  }

  sleep(0.5);

  // ──────── Step 2: View provider profile ────────
  const profileRes = http.get(
    `${BASE_URL}/api/public/providers/${providerId}`,
    { headers: headers(), tags: { step: "provider_view" } }
  );
  providerViewDuration.add(profileRes.timings.duration);
  const profileOk = check(profileRes, {
    "provider view: status 200": (r) => r.status === 200,
    "provider view: < 2 s": (r) => r.timings.duration < 2000,
  });
  failRate.add(!profileOk);

  sleep(0.5);

  // ──────── Step 3: Check availability ────────
  const availRes = http.get(
    `${BASE_URL}/api/public/providers/${providerId}/availability?date=${date}`,
    { headers: headers(), tags: { step: "availability" } }
  );
  availabilityDuration.add(availRes.timings.duration);
  const availOk = check(availRes, {
    "availability: status 200": (r) => r.status === 200,
    "availability: < 2 s": (r) => r.timings.duration < 2000,
  });
  failRate.add(!availOk);

  // Pick a time slot (if available)
  let timeSlot;
  try {
    const body = JSON.parse(availRes.body);
    const slots = body.data?.slots || body.slots || [];
    if (slots.length > 0) {
      timeSlot = slots[0].start_time || slots[0].time;
    }
  } catch {
    // no-op
  }

  if (!timeSlot) {
    sleep(1);
    return;
  }

  sleep(0.5);

  // ──────── Step 4: Create booking hold ────────
  const holdRes = http.post(
    `${BASE_URL}/api/bookings/hold`,
    JSON.stringify({
      provider_id: providerId,
      date,
      start_time: timeSlot,
    }),
    { headers: headers(), tags: { step: "booking_hold" } }
  );
  holdDuration.add(holdRes.timings.duration);
  const holdOk = check(holdRes, {
    "hold: status 2xx": (r) => r.status >= 200 && r.status < 300,
    "hold: < 2 s": (r) => r.timings.duration < 2000,
  });
  failRate.add(!holdOk);

  let holdId;
  try {
    const body = JSON.parse(holdRes.body);
    holdId = body.data?.id || body.id || body.hold_id;
  } catch {
    // no-op
  }

  sleep(0.5);

  // ──────── Step 5: Create booking ────────
  const bookingRes = http.post(
    `${BASE_URL}/api/bookings`,
    JSON.stringify({
      provider_id: providerId,
      hold_id: holdId,
      date,
      start_time: timeSlot,
      notes: "k6 load test booking",
    }),
    { headers: headers(), tags: { step: "create_booking" } }
  );
  bookingDuration.add(bookingRes.timings.duration);
  const bookOk = check(bookingRes, {
    "booking: status 2xx": (r) => r.status >= 200 && r.status < 300,
    "booking: < 2 s": (r) => r.timings.duration < 2000,
  });
  failRate.add(!bookOk);

  sleep(1);
}
