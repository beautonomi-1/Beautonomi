import { describe, expect, it } from "vitest";
import { enrichRetentionCaseRow } from "@/lib/provider-ops/retention-enrich";
import { ACTIVATION_SLA_DAYS_14, BROADCAST_TOUCH_SUPPRESS_DAYS, daysBetween } from "@/lib/provider-ops/retention-rules";

const NOW = new Date("2026-06-15T12:00:00Z").getTime();

function daysAgo(n: number): string {
  return new Date(NOW - n * 86400000).toISOString();
}

function daysFromNow(n: number): string {
  return new Date(NOW + n * 86400000).toISOString();
}

/** Mirrors broadcast-audience inclusion rules for no_booking tab. */
function includeNoBookingBroadcast(enriched: ReturnType<typeof enrichRetentionCaseRow>): boolean {
  const days = enriched.days_since_activation ?? 0;
  if (days < ACTIVATION_SLA_DAYS_14) return false;
  const lastTouch = enriched.last_touch_at;
  if (lastTouch && daysBetween(lastTouch, NOW) < BROADCAST_TOUCH_SUPPRESS_DAYS) return false;
  const snooze = enriched.next_follow_up_at as string | null;
  if (snooze && new Date(snooze).getTime() > NOW) return false;
  const prov = enriched.providers as { user_id?: string | null } | null | undefined;
  return Boolean(prov?.user_id);
}

describe("broadcast audience filters", () => {
  it("includes stalled no-booking providers past 14d without recent touch or snooze", () => {
    const row = enrichRetentionCaseRow(
      {
        id: "c1",
        status: "activated",
        activated_at: daysAgo(20),
        first_booking_at: null,
        last_qualifying_booking_at: null,
        qualifying_booking_count: 0,
        returned_at: null,
        churn_reason: null,
        next_follow_up_at: null,
        at_risk_flagged_at: null,
        winback_step: 0,
        providers: { id: "p1", business_name: "Biz", status: "active", user_id: "u1" },
      },
      null,
      NOW,
    );
    expect(includeNoBookingBroadcast(row)).toBe(true);
  });

  it("excludes when follow-up snooze is in the future", () => {
    const row = enrichRetentionCaseRow(
      {
        id: "c2",
        status: "activated",
        activated_at: daysAgo(20),
        first_booking_at: null,
        last_qualifying_booking_at: null,
        qualifying_booking_count: 0,
        returned_at: null,
        churn_reason: null,
        next_follow_up_at: daysFromNow(4),
        at_risk_flagged_at: null,
        winback_step: 0,
        providers: { id: "p1", business_name: "Biz", status: "active", user_id: "u1" },
      },
      null,
      NOW,
    );
    expect(includeNoBookingBroadcast(row)).toBe(false);
  });
});
