/**
 * Static regressions for group-booking money paths, arrival idempotency and
 * post-response side effects. They read source so a refactor that drops a
 * guard fails CI without a live DB.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const webSrc = join(__dirname, "../..");

function readWeb(relative: string): string {
  return readFileSync(join(webSrc, relative), "utf8");
}

describe("Provider booking create: group participants carry no platform fee", () => {
  const src = readWeb("app/api/provider/bookings/route.ts");

  it("rejects a group id that is foreign or cancelled", () => {
    expect(src).toContain('"Group booking not found for this provider", "INVALID_GROUP_BOOKING"');
    expect(src).toContain('"Cannot add bookings to a cancelled group", "INVALID_GROUP_BOOKING"');
  });

  it("only computes the provider fee for non-group, non-walk-in bookings", () => {
    expect(src).toMatch(/if \(!isWalkIn && !normalizedGroupBookingId\)/);
  });
});

describe("Card-machine settlement for groups", () => {
  const src = readWeb("lib/payments/settle-card-machine-payment.ts");

  it("puts the tip on the primary-contact participant", () => {
    expect(src).toContain('.select("booking_id, is_primary_contact")');
    expect(src).toMatch(/bookings\.find\(\(b\) => b\.id === primaryParticipantBookingId\) \?\? bookings\[0\]/);
  });

  it("skips the tip when the base is under-allocated", () => {
    expect(src).toMatch(/totalBaseAllocated \+ 0\.01 >= totalBaseOwed/);
  });

  it("increments rather than overwrites tip_amount", () => {
    expect(src).toContain("incrementBookingTipAmount(");
  });
});

describe("Pay-remaining webhook tip", () => {
  const src = readWeb("app/api/payments/webhook/_handlers/charge-success.ts");

  it("applies the tip once per booking payment, including on a retry after a crash", () => {
    expect(src).not.toContain("insertedPayRemainingPayment");
    expect(src).toMatch(
      /if \(incrementalTipFromMeta > 0\) \{[\s\S]{0,600}applyBookingPaymentTip\(\s*supabase,\s*bookingId,\s*payRemainingSourcePaymentId,\s*incrementalTipFromMeta,?\s*\)/,
    );
  });

  it("applies the tip before posting the ledger", () => {
    expect(src.indexOf("applyBookingPaymentTip(")).toBeLessThan(
      src.indexOf('auditLegStyle: "paystack_pay_remaining"'),
    );
  });

  it("posts the tip as an incremental ledger leg on top of the booking-level tip", () => {
    expect(src).toContain("incrementalTipAmount: incrementalTipFromMeta > 0 ? incrementalTipFromMeta : undefined");
    expect(src).toMatch(/tip: ledgerBaseTip,/);
  });
});

describe("Migration 9991 booking payment tips", () => {
  const sql = readFileSync(
    join(webSrc, "../../../supabase/migrations/9991_booking_payment_tip_applications.sql"),
    "utf8",
  );

  it("marks and increments in one function guarded by a primary key", () => {
    expect(sql).toContain("booking_payment_id UUID PRIMARY KEY");
    expect(sql).toContain("ON CONFLICT (booking_payment_id) DO NOTHING");
    expect(sql).toMatch(/GET DIAGNOSTICS v_inserted = ROW_COUNT;\s*IF v_inserted = 0 THEN\s*RETURN FALSE;/);
    expect(sql).toMatch(/tip_amount = COALESCE\(tip_amount, 0\) \+ v_tip,\s*total_amount = COALESCE\(total_amount, 0\) \+ v_tip/);
  });

  it("is callable by service_role only", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.apply_booking_payment_tip(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.apply_booking_payment_tip(UUID, NUMERIC) TO service_role;");
  });

  it("has no byte-order mark", () => {
    expect(sql.charCodeAt(0)).not.toBe(0xfeff);
  });
});

describe("Arrival route", () => {
  const src = readWeb("app/api/provider/bookings/[id]/arrive/route.ts");

  it("is idempotent for an already-arrived booking", () => {
    expect(src).toContain("already_arrived: true");
  });

  it("sends notifications after the response", () => {
    expect(src).toMatch(/import\s*\{[^}]*\bafter\b[^}]*\}\s*from\s*["']next\/server["']/);
    expect(src).toContain("after(async () => {");
  });
});

describe("Group booking route", () => {
  const src = readWeb("app/api/provider/group-bookings/[id]/route.ts");

  it("defers cancellation notifications and waitlist matching until after the response", () => {
    expect(src).toMatch(/import\s*\{[^}]*\bafter\b[^}]*\}\s*from\s*["']next\/server["']/);
    const afterIdx = src.indexOf("after(async () => {");
    expect(afterIdx).toBeGreaterThan(-1);
    const block = src.slice(afterIdx, afterIdx + 1500);
    expect(block).toContain("matchWaitlistOnCancellation");
    expect(block).toContain("sendCancellationNotification");
  });

  it("only treats the PATCH as a slot move when values differ from the stored group", () => {
    expect(src).toContain("const movingSlot =");
    const idx = src.indexOf("const movingSlot =");
    expect(src.slice(idx, idx + 600)).toContain("existing");
  });
});
