import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPublicStaffIdForBooking, normalizePublicStaffIdForDatabase } from "@beautonomi/utils";
import { zPublicBookingStaffIdOptional } from "@/lib/public-booking/zod-public-staff-id";
import {
  DEFAULT_HOLD_FAILURE_MESSAGE,
  getBookingHoldFailureMessage,
} from "@/lib/public-booking/booking-hold-slot-messages";

/** Valid Postgres uuids whose variant nibble (c/d/e) is outside RFC 4122 — e.g. staging E2E seed rows. */
const NON_RFC_LOCATION_ID = "00000000-e2e0-4000-c000-000000000001";
const NON_RFC_OFFERING_ID = "00000000-e2e0-4000-d000-000000000001";
const NON_RFC_STAFF_ID = "00000000-e2e0-4000-e000-000000000001";

const repoRoot = join(__dirname, "../../../../../..");

describe("public booking id validation accepts any Postgres uuid", () => {
  it("staff id helper accepts non-RFC uuids and solo placeholders", () => {
    expect(isPublicStaffIdForBooking(NON_RFC_STAFF_ID)).toBe(true);
    expect(isPublicStaffIdForBooking(`provider-${NON_RFC_OFFERING_ID}`)).toBe(true);
    expect(isPublicStaffIdForBooking("not-a-uuid")).toBe(false);
    expect(normalizePublicStaffIdForDatabase(`provider-${NON_RFC_OFFERING_ID}`).dbStaffId).toBeNull();
  });

  it("zPublicBookingStaffIdOptional parses non-RFC staff ids and maps 'any' to null", () => {
    expect(zPublicBookingStaffIdOptional.safeParse(NON_RFC_STAFF_ID).success).toBe(true);
    expect(zPublicBookingStaffIdOptional.parse("any")).toBeNull();
    expect(zPublicBookingStaffIdOptional.safeParse("bogus").success).toBe(false);
  });

  it("hold, consume, promotions and waitlist schemas do not use RFC-strict z.string().uuid()", () => {
    for (const rel of [
      "apps/web/src/app/api/public/booking-holds/route.ts",
      "apps/web/src/app/api/public/booking-holds/[id]/consume/route.ts",
      "apps/web/src/app/api/public/promotions/validate/route.ts",
      "apps/web/src/app/api/public/waitlist/route.ts",
    ]) {
      const src = readFileSync(join(repoRoot, rel), "utf8");
      expect(src, rel).not.toMatch(/z\.string\(\)\.uuid\(/);
    }
  });

  it("z.guid() accepts the seed ids that z.string().uuid() rejects", async () => {
    const { z } = await import("zod");
    for (const id of [NON_RFC_LOCATION_ID, NON_RFC_OFFERING_ID, NON_RFC_STAFF_ID]) {
      expect(z.guid().safeParse(id).success).toBe(true);
    }
  });
});

describe("booking-flow step query sync", () => {
  it("is guarded and shallow so it cannot loop RSC refetches", () => {
    const src = readFileSync(
      join(repoRoot, "apps/web/src/app/booking/components/booking-flow.tsx"),
      "utf8",
    );
    const start = src.indexOf("const syncStepQueryParam = useCallback(");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("useEffect(", start));
    expect(body).toMatch(/if \(p\.get\("step"\) === stepParam\) return;/);
    expect(body).toContain("window.history.replaceState");
    expect(body).not.toContain("router.replace(");
  });
});

describe("getBookingHoldFailureMessage", () => {
  it("maps slot_error_code to specific copy", () => {
    expect(
      getBookingHoldFailureMessage({ status: 409, details: { slot_error_code: "SLOT_TAKEN_BY_HOLD" } }),
    ).toMatch(/Someone else just reserved/);
  });

  it("falls back to the generic message for validation errors", () => {
    expect(
      getBookingHoldFailureMessage({ status: 400, message: "staff_id: Invalid staff ID" }),
    ).toBe(DEFAULT_HOLD_FAILURE_MESSAGE);
    expect(getBookingHoldFailureMessage(null)).toBe(DEFAULT_HOLD_FAILURE_MESSAGE);
  });
});
