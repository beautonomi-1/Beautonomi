#!/usr/bin/env node
/**
 * E2E Staging Seed Script
 *
 * Provisions (idempotently) a deterministic, bookable provider on the staging
 * Supabase instance so that the booking E2E test can run against a known slug
 * rather than relying on a manually-created test provider.
 *
 * Outputs the provider slug to stdout so GitHub Actions can capture it:
 *   E2E_PROVIDER_SLUG=$(node scripts/e2e/seed-staging.mjs)
 *
 * Required environment variables:
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service-role key (bypasses RLS)
 *
 * Optional:
 *   E2E_TENANT_ID             — Tenant UUID (defaults to slug za)
 *   E2E_TENANT_SLUG           — Tenant slug when E2E_TENANT_ID unset (default: za)
 *   E2E_SEED_CURRENCY         — Currency code (default: ZAR)
 *
 * What it seeds (all upserted by deterministic UUID / slug — safe to re-run):
 *   1–7. Default E2E provider (`e2e-test-provider-beautonomi`) + owner auth user
 *   8–9. Matrix providers (unless E2E_MATRIX_FIXTURES=0):
 *        - `e2e-test-provider-auth-before-time` (require_auth_step=before_time_selection)
 *        - `e2e-test-provider-at-home` (at-home offering + platform zone selection)
 *        Each matrix provider has its **own** auth user (providers.user_id is unique).
 *
 * Verify on staging web:
 *   node apps/web/scripts/verify-booking-e2e-chain.mjs https://staging.beautonomi.com <slug>
 *   (set E2E_OFFERING_ID to d000…001 / d000…002 / d000…003 per slug — see STAGING_MATRIX_PREP.md)
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CURRENCY = process.env.E2E_SEED_CURRENCY ?? "ZAR";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("[seed-staging] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Deterministic IDs — stable across re-runs so the seed is idempotent.
const SEED_USER_ID = "00000000-e2e0-4000-a000-000000000001";
const SEED_PROVIDER_ID = "00000000-e2e0-4000-b000-000000000001";
const SEED_LOCATION_ID = "00000000-e2e0-4000-c000-000000000001";
const SEED_OFFERING_ID = "00000000-e2e0-4000-d000-000000000001";
const SEED_STAFF_ID = "00000000-e2e0-4000-e000-000000000001";
const SEED_SLUG = "e2e-test-provider-beautonomi";
const SEED_EMAIL = "e2e-provider@beautonomi-staging.invalid";

/** Matrix QA providers (B1/B2 auth-before-time, E2 at-home). Enabled unless E2E_MATRIX_FIXTURES=0 */
const MATRIX_FIXTURES_ENABLED = process.env.E2E_MATRIX_FIXTURES !== "0";
const SEED_AUTH_BEFORE_USER_ID = "00000000-e2e0-4000-a000-000000000002";
const SEED_AUTH_BEFORE_EMAIL = "e2e-auth-before@beautonomi-staging.invalid";
const SEED_AT_HOME_USER_ID = "00000000-e2e0-4000-a000-000000000003";
const SEED_AT_HOME_EMAIL = "e2e-at-home@beautonomi-staging.invalid";
const SEED_AUTH_BEFORE_PROVIDER_ID = "00000000-e2e0-4000-b000-000000000002";
const SEED_AUTH_BEFORE_SLUG = "e2e-test-provider-auth-before-time";
const SEED_AUTH_BEFORE_LOCATION_ID = "00000000-e2e0-4000-c000-000000000002";
const SEED_AUTH_BEFORE_OFFERING_ID = "00000000-e2e0-4000-d000-000000000002";
const SEED_AUTH_BEFORE_STAFF_ID = "00000000-e2e0-4000-e000-000000000002";
const SEED_AT_HOME_PROVIDER_ID = "00000000-e2e0-4000-b000-000000000003";
const SEED_AT_HOME_SLUG = "e2e-test-provider-at-home";
const SEED_AT_HOME_OFFERING_ID = "00000000-e2e0-4000-d000-000000000003";
const SEED_AT_HOME_LOCATION_ID = "00000000-e2e0-4000-c000-000000000003";
const SEED_AT_HOME_STAFF_ID = "00000000-e2e0-4000-e000-000000000003";
const SEED_PLATFORM_ZONE_ID = "00000000-e2e0-4000-f000-000000000001";
const SEED_ZONE_SELECTION_ID = "00000000-e2e0-4000-f000-000000000002";

// Canonical working-hours structure: Mon-Sun 08:00-18:00 open
const WORKING_HOURS = Object.fromEntries(
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => [
    day,
    { is_open: true, open_time: "08:00", close_time: "18:00" },
  ])
);

async function resolveTenantId() {
  if (process.env.E2E_TENANT_ID) return process.env.E2E_TENANT_ID;
  const slug = process.env.E2E_TENANT_SLUG ?? "za";
  const { data, error } = await supabase.from("tenants").select("id").eq("slug", slug).maybeSingle();
  if (error || !data) {
    console.error("[seed-staging] Could not resolve tenant_id for slug", slug, error?.message);
    process.exit(1);
  }
  return data.id;
}

async function upsertAuthUser(userId, email, fullName) {
  const { data: existing } = await supabase.auth.admin.getUserById(userId);
  if (existing?.user) return;

  const { data: byEmail } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const hit = byEmail?.users?.find((u) => u.email === email);
  if (hit?.id) {
    if (hit.id !== userId) {
      console.error(
        `[seed-staging] ${email} exists with id ${hit.id}; expected ${userId}. Delete or change seed user id.`,
      );
      process.exit(1);
    }
    return;
  }

  const { error } = await supabase.auth.admin.createUser({
    id: userId,
    email,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: { role: "provider_owner", full_name: fullName },
  });
  if (error && !/already been registered|already exists/i.test(error.message)) {
    console.error("[seed-staging] createUser error:", error.message);
    process.exit(1);
  }
}

async function upsertUsersRow(tenantId, userId, email, fullName) {
  const { error } = await supabase.from("users").upsert(
    {
      id: userId,
      email,
      role: "provider_owner",
      full_name: fullName,
      preferred_home_tenant_id: tenantId,
    },
    { onConflict: "id" },
  );
  if (error) {
    console.error("[seed-staging] users upsert error:", error.message);
    process.exit(1);
  }
}

async function upsertProvider(tenantId) {
  const { error } = await supabase.from("providers").upsert(
    {
      id: SEED_PROVIDER_ID,
      user_id: SEED_USER_ID,
      business_name: "E2E Test Salon",
      business_type: "salon",
      slug: SEED_SLUG,
      description: "Automatically seeded provider for E2E tests. Do not book manually.",
      status: "active",
      is_verified: true,
      currency: CURRENCY,
      online_booking_enabled: true,
      booking_advance_notice_hours: 0, // no min-notice so E2E can book any slot
      tenant_id: tenantId,
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("[seed-staging] providers upsert error:", error.message);
    process.exit(1);
  }
}

async function upsertLocation() {
  const { error } = await supabase.from("provider_locations").upsert(
    {
      id: SEED_LOCATION_ID,
      provider_id: SEED_PROVIDER_ID,
      name: "E2E Studio",
      address_line1: "1 Test Street",
      city: "Johannesburg",
      state: "Gauteng",
      country: "ZA",
      is_active: true,
      is_primary: true,
      working_hours: WORKING_HOURS,
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("[seed-staging] provider_locations upsert error:", error.message);
    process.exit(1);
  }
}

async function upsertOffering() {
  const { error } = await supabase.from("offerings").upsert(
    {
      id: SEED_OFFERING_ID,
      provider_id: SEED_PROVIDER_ID,
      title: "E2E Test Service",
      description: "Automatically seeded offering for E2E tests.",
      duration_minutes: 60,
      buffer_minutes: 0,
      price: 100.0,
      currency: CURRENCY,
      is_active: true,
      supports_at_salon: true,
      supports_at_home: false,
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("[seed-staging] offerings upsert error:", error.message);
    process.exit(1);
  }
}

async function upsertOnlineBookingSettings() {
  const { error } = await supabase.from("provider_online_booking_settings").upsert(
    {
      provider_id: SEED_PROVIDER_ID,
      min_notice_minutes: 0, // allow immediate booking so E2E never hits notice gate
      max_advance_days: 365,
      allow_pay_in_person: true,
      deposit_required: false,
      require_auth_step: "checkout",
      staff_selection_mode: "anyone_default",
    },
    { onConflict: "provider_id" }
  );
  if (error) {
    console.error("[seed-staging] provider_online_booking_settings upsert error:", error.message);
    // Non-fatal — availability can still work without this row
  }
}

async function upsertStaff() {
  const { error } = await supabase.from("provider_staff").upsert(
    {
      id: SEED_STAFF_ID,
      provider_id: SEED_PROVIDER_ID,
      user_id: SEED_USER_ID,
      name: "E2E Stylist",
      role: "owner",
      is_active: true,
      working_hours: WORKING_HOURS,
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("[seed-staging] provider_staff upsert error:", error.message);
    process.exit(1);
  }
}

// Run seed
const tenantId = await resolveTenantId();

await upsertAuthUser(SEED_USER_ID, SEED_EMAIL, "E2E Test Provider");
await upsertUsersRow(tenantId, SEED_USER_ID, SEED_EMAIL, "E2E Test Provider");
await upsertProvider(tenantId);
await upsertLocation();
await upsertOffering();
await upsertOnlineBookingSettings();
await upsertStaff();

async function upsertMatrixAuthBeforeProvider(tenantId) {
  const { error: pErr } = await supabase.from("providers").upsert(
    {
      id: SEED_AUTH_BEFORE_PROVIDER_ID,
      user_id: SEED_AUTH_BEFORE_USER_ID,
      business_name: "E2E Auth Before Time Salon",
      business_type: "salon",
      slug: SEED_AUTH_BEFORE_SLUG,
      description: "Seeded for matrix B1/B2 (require_auth_step=before_time_selection).",
      status: "active",
      is_verified: true,
      currency: CURRENCY,
      online_booking_enabled: true,
      booking_advance_notice_hours: 0,
      tenant_id: tenantId,
    },
    { onConflict: "id" },
  );
  if (pErr) {
    console.error("[seed-staging] matrix auth-before provider:", pErr.message);
    process.exit(1);
  }
  await supabase.from("provider_locations").upsert(
    {
      id: SEED_AUTH_BEFORE_LOCATION_ID,
      provider_id: SEED_AUTH_BEFORE_PROVIDER_ID,
      name: "E2E Studio (auth gate)",
      address_line1: "2 Test Street",
      city: "Johannesburg",
      state: "Gauteng",
      country: "ZA",
      is_active: true,
      is_primary: true,
      working_hours: WORKING_HOURS,
    },
    { onConflict: "id" },
  );
  await supabase.from("offerings").upsert(
    {
      id: SEED_AUTH_BEFORE_OFFERING_ID,
      provider_id: SEED_AUTH_BEFORE_PROVIDER_ID,
      title: "E2E Auth Gate Service",
      description: "Auth-before-time matrix fixture.",
      duration_minutes: 60,
      buffer_minutes: 0,
      price: 100.0,
      currency: CURRENCY,
      is_active: true,
      supports_at_salon: true,
      supports_at_home: false,
    },
    { onConflict: "id" },
  );
  await supabase.from("provider_online_booking_settings").upsert(
    {
      provider_id: SEED_AUTH_BEFORE_PROVIDER_ID,
      min_notice_minutes: 0,
      max_advance_days: 365,
      allow_pay_in_person: true,
      deposit_required: false,
      require_auth_step: "before_time_selection",
      staff_selection_mode: "anyone_default",
    },
    { onConflict: "provider_id" },
  );
  await supabase.from("provider_staff").upsert(
    {
      id: SEED_AUTH_BEFORE_STAFF_ID,
      provider_id: SEED_AUTH_BEFORE_PROVIDER_ID,
      user_id: SEED_AUTH_BEFORE_USER_ID,
      name: "E2E Stylist (auth gate)",
      role: "owner",
      is_active: true,
      working_hours: WORKING_HOURS,
    },
    { onConflict: "id" },
  );
}

async function upsertMatrixAtHomeProvider(tenantId) {
  const { error: pErr } = await supabase.from("providers").upsert(
    {
      id: SEED_AT_HOME_PROVIDER_ID,
      user_id: SEED_AT_HOME_USER_ID,
      business_name: "E2E At-Home Provider",
      business_type: "freelancer",
      slug: SEED_AT_HOME_SLUG,
      description: "Seeded for matrix E2 (at-home + radius zone around Johannesburg).",
      status: "active",
      is_verified: true,
      currency: CURRENCY,
      online_booking_enabled: true,
      offers_mobile_services: true,
      booking_advance_notice_hours: 0,
      tenant_id: tenantId,
    },
    { onConflict: "id" },
  );
  if (pErr) {
    console.error("[seed-staging] matrix at-home provider:", pErr.message);
    process.exit(1);
  }
  await supabase.from("provider_locations").upsert(
    {
      id: SEED_AT_HOME_LOCATION_ID,
      provider_id: SEED_AT_HOME_PROVIDER_ID,
      name: "E2E Mobile Base",
      address_line1: "3 Test Street",
      city: "Johannesburg",
      state: "Gauteng",
      country: "ZA",
      is_active: true,
      is_primary: true,
      working_hours: WORKING_HOURS,
    },
    { onConflict: "id" },
  );
  await supabase.from("offerings").upsert(
    {
      id: SEED_AT_HOME_OFFERING_ID,
      provider_id: SEED_AT_HOME_PROVIDER_ID,
      title: "E2E At-Home Service",
      description: "Mobile service for E2 matrix.",
      duration_minutes: 60,
      buffer_minutes: 0,
      price: 150.0,
      currency: CURRENCY,
      is_active: true,
      supports_at_salon: false,
      supports_at_home: true,
    },
    { onConflict: "id" },
  );
  await supabase.from("provider_online_booking_settings").upsert(
    {
      provider_id: SEED_AT_HOME_PROVIDER_ID,
      min_notice_minutes: 0,
      max_advance_days: 365,
      allow_pay_in_person: true,
      deposit_required: false,
      require_auth_step: "checkout",
      staff_selection_mode: "anyone_default",
    },
    { onConflict: "provider_id" },
  );
  await supabase.from("provider_staff").upsert(
    {
      id: SEED_AT_HOME_STAFF_ID,
      provider_id: SEED_AT_HOME_PROVIDER_ID,
      user_id: SEED_AT_HOME_USER_ID,
      name: "E2E Mobile Stylist",
      role: "owner",
      is_active: true,
      working_hours: WORKING_HOURS,
    },
    { onConflict: "id" },
  );
  const { error: zoneErr } = await supabase.from("platform_zones").upsert(
    {
      id: SEED_PLATFORM_ZONE_ID,
      name: "E2E Johannesburg 50km",
      zone_type: "radius",
      center_latitude: -26.2041,
      center_longitude: 28.0473,
      radius_km: 50,
      description: "Seeded radius for E2E at-home validate tests",
      is_active: true,
      created_by: SEED_USER_ID,
    },
    { onConflict: "id" },
  );
  if (zoneErr) {
    console.error("[seed-staging] platform_zones (E2):", zoneErr.message);
    process.exit(1);
  }
  await supabase.from("provider_zone_selections").upsert(
    {
      id: SEED_ZONE_SELECTION_ID,
      provider_id: SEED_AT_HOME_PROVIDER_ID,
      platform_zone_id: SEED_PLATFORM_ZONE_ID,
      travel_fee: 0,
      travel_time_minutes: 30,
      is_active: true,
    },
    { onConflict: "id" },
  );
}

if (MATRIX_FIXTURES_ENABLED) {
  await upsertAuthUser(SEED_AUTH_BEFORE_USER_ID, SEED_AUTH_BEFORE_EMAIL, "E2E Auth Before Owner");
  await upsertUsersRow(
    tenantId,
    SEED_AUTH_BEFORE_USER_ID,
    SEED_AUTH_BEFORE_EMAIL,
    "E2E Auth Before Owner",
  );
  await upsertAuthUser(SEED_AT_HOME_USER_ID, SEED_AT_HOME_EMAIL, "E2E At-Home Owner");
  await upsertUsersRow(tenantId, SEED_AT_HOME_USER_ID, SEED_AT_HOME_EMAIL, "E2E At-Home Owner");
  await upsertMatrixAuthBeforeProvider(tenantId);
  await upsertMatrixAtHomeProvider(tenantId);
  process.stderr.write(
    `[seed-staging] Matrix slugs: ${SEED_AUTH_BEFORE_SLUG}, ${SEED_AT_HOME_SLUG}\n`,
  );
}

// Print slug to stdout so callers can capture it.
process.stdout.write(SEED_SLUG + "\n");
process.stderr.write(
  `[seed-staging] Seed complete. Provider slug: ${SEED_SLUG}\n`
);
