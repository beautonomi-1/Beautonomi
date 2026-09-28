/**
 * Concurrent booking slot race (migration 946 / lock_staff_schedule).
 *
 * Requires staging with SUPABASE_SERVICE_ROLE + two parallel create attempts
 * for the same empty staff slot. Skip locally when staging URL is unset.
 */
import { test } from "@playwright/test";

test.describe("concurrent booking slot", () => {
  test.skip(
    !process.env.E2E_STAGING_API_URL?.trim(),
    "Set E2E_STAGING_API_URL to run concurrent slot tests against staging",
  );

  test("one parallel create succeeds and one returns BOOKING_SLOT_CONFLICT", async () => {
    // TODO: fire two POST /api/public/bookings (or RPC) for the same staff + window;
    // expect exactly one 201 and one 409 with BOOKING_SLOT_CONFLICT.
  });
});
