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
 *   E2E_TENANT_ID             — Tenant UUID (defaults to the first tenant)
 *   E2E_SEED_CURRENCY         — Currency code (default: ZAR)
 *
 * What it seeds (all upserted by deterministic UUID / slug — safe to re-run):
 *   1. A staging auth user (provider owner)
 *   2. A `users` profile row for that user
 *   3. A `providers` row (status=active, online_booking_enabled=true)
 *   4. A `provider_locations` row with working hours Mon-Sun 08:00-18:00
 *   5. An `offerings` row (60-minute bookable service)
 *   6. A `provider_online_booking_settings` row (no-deposit, allow_pay_in_person=true)
 *   7. A `provider_staff` row for the owner (required for availability engine)
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

// Canonical working-hours structure: Mon-Sun 08:00-18:00 open
const WORKING_HOURS = Object.fromEntries(
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => [
    day,
    { is_open: true, open_time: "08:00", close_time: "18:00" },
  ])
);

async function resolveTenantId() {
  if (process.env.E2E_TENANT_ID) return process.env.E2E_TENANT_ID;
  const { data, error } = await supabase.from("tenants").select("id").limit(1).single();
  if (error || !data) {
    console.error("[seed-staging] Could not resolve tenant_id:", error?.message);
    process.exit(1);
  }
  return data.id;
}

async function upsertAuthUser() {
  // Use admin auth API to create the user if absent (idempotent via email lookup)
  const { data: existing } = await supabase.auth.admin.getUserById(SEED_USER_ID);
  if (existing?.user) return;

  const { error } = await supabase.auth.admin.createUser({
    user_id: SEED_USER_ID,
    email: SEED_EMAIL,
    password: randomUUID(), // non-interactive; never used for login
    email_confirm: true,
  });
  if (error && !error.message.includes("already been registered")) {
    console.error("[seed-staging] createUser error:", error.message);
    process.exit(1);
  }
}

async function upsertUsersRow(tenantId) {
  const { error } = await supabase.from("users").upsert(
    {
      id: SEED_USER_ID,
      email: SEED_EMAIL,
      role: "provider_owner",
      full_name: "E2E Test Provider",
      tenant_id: tenantId,
    },
    { onConflict: "id" }
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

async function upsertLocation(tenantId) {
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
      tenant_id: tenantId,
    },
    { onConflict: "id" }
  );
  if (error && !error.message.includes("column \"tenant_id\" of relation")) {
    // tenant_id is optional on provider_locations in some versions
    const { error: e2 } = await supabase.from("provider_locations").upsert(
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
    if (e2) {
      console.error("[seed-staging] provider_locations upsert error:", e2.message);
      process.exit(1);
    }
  } else if (error) {
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
      is_active: true,
      location_type: "at_salon",
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

await upsertAuthUser();
await upsertUsersRow(tenantId);
await upsertProvider(tenantId);
await upsertLocation(tenantId);
await upsertOffering();
await upsertOnlineBookingSettings();
await upsertStaff();

// Print slug to stdout so callers can capture it.
process.stdout.write(SEED_SLUG + "\n");
process.stderr.write(
  `[seed-staging] Seed complete. Provider slug: ${SEED_SLUG}\n`
);
