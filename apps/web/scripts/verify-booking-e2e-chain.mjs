#!/usr/bin/env node
/**
 * Smoke the public API chain used by /booking for the seeded E2E provider.
 * Usage: node scripts/verify-booking-e2e-chain.mjs [baseUrl] [slug]
 */
const base = (process.argv[2] || process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const slug = process.argv[3] || process.env.E2E_PROVIDER_SLUG || "e2e-test-provider-beautonomi";
const offeringId =
  process.env.E2E_OFFERING_ID || "00000000-e2e0-4000-d000-000000000001";

async function get(path) {
  const url = `${base}${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path} → ${res.status} (non-JSON)`);
  }
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${text.slice(0, 200)}`);
  return json;
}

function ok(label, detail = "") {
  console.log(`✓ ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log(`Booking API chain @ ${base} slug=${slug}\n`);

  const bookRedirect = await fetch(`${base}/book/${encodeURIComponent(slug)}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(120_000),
  });
  if (![301, 307, 308].includes(bookRedirect.status)) {
    throw new Error(`/book/${slug} expected 308, got ${bookRedirect.status}`);
  }
  ok("Legacy /book/{slug} redirect", bookRedirect.headers.get("location") || "");

  const prov = await get(`/api/public/providers/${encodeURIComponent(slug)}`);
  const providerId = prov?.data?.id;
  if (!providerId) throw new Error("provider id missing");
  ok("Provider profile", providerId);

  const services = await get(
    `/api/services?type=salon&providerSlug=${encodeURIComponent(slug)}&serviceId=${encodeURIComponent(offeringId)}`,
  );
  const list = services?.data ?? [];
  if (!Array.isArray(list) || list.length === 0) throw new Error("no services");
  ok("Services catalog", `${list.length} offering(s)`);

  const staff = await get(`/api/public/providers/${encodeURIComponent(slug)}/staff`);
  ok("Staff", `${(staff?.data ?? []).length} member(s)`);

  await get(
    `/api/public/providers/${encodeURIComponent(slug)}/online-booking-settings`,
  ).catch((e) => {
    console.warn(`⚠ online-booking-settings: ${e.message}`);
  });
  ok("Online booking settings", "reachable or skipped");

  let slot = null;
  let dateStr = "";
  for (let i = 0; i < 14 && !slot; i++) {
    const d = new Date(Date.now() + i * 86_400_000);
    dateStr = d.toISOString().slice(0, 10);
    const avail = await get(
      `/api/public/providers/${encodeURIComponent(slug)}/availability?date=${dateStr}&service_ids=${encodeURIComponent(offeringId)}`,
    ).catch((e) => {
      console.warn(`⚠ availability (${dateStr}): ${e.message}`);
      return null;
    });
    slot = (avail?.data?.slots ?? []).find((s) => (s.is_available ?? s.available) && s.start && s.end && new Date(s.start) > new Date(Date.now() + 3_600_000)) ?? null;
  }
  if (!slot) throw new Error("no available slot in the next 14 days");
  ok("Availability", `${dateStr} ${slot.start}`);

  const staffId = slot.staff_id ?? (staff?.data ?? [])[0]?.id ?? null;
  const locationId = prov?.data?.locations?.[0]?.id ?? null;
  const holdRes = await fetch(`${base}/api/public/booking-holds`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      provider_id: providerId,
      staff_id: staffId,
      services: [{ offering_id: offeringId, staff_id: staffId }],
      start_at: new Date(slot.start).toISOString(),
      end_at: new Date(slot.end).toISOString(),
      location_type: "at_salon",
      location_id: locationId,
      preferred_staff_ids: slot.available_staff_ids ?? null,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const holdJson = await holdRes.json().catch(() => ({}));
  const holdId = holdJson?.data?.hold_id ?? holdJson?.data?.id;
  if (!holdRes.ok || !holdId) {
    throw new Error(`booking-holds → ${holdRes.status}: ${JSON.stringify(holdJson).slice(0, 300)}`);
  }
  ok("Slot hold created", `${holdId} (staff=${staffId ?? "any"}, location=${locationId ?? "none"})`);

  const rel = await fetch(`${base}/api/public/booking-holds/${holdId}/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(60_000),
  });
  ok("Slot hold released", String(rel.status));

  console.log("\nPublic booking API chain OK.");
}

main().catch((e) => {
  console.error("\n✗", e.message || e);
  process.exit(1);
});
