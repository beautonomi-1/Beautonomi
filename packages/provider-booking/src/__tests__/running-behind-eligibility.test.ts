import { describe, expect, it } from "vitest";
import {
  anyEligibleForRunningBehindNotify,
  isEligibleForRunningBehindNotify,
} from "../running-behind-eligibility";

describe("running-behind-eligibility", () => {
  const now = new Date("2026-10-06T14:00:00.000Z").getTime();

  it("includes future confirmed bookings", () => {
    expect(
      isEligibleForRunningBehindNotify(
        { status: "confirmed", scheduled_at: "2026-10-06T15:00:00.000Z" },
        now,
      ),
    ).toBe(true);
  });

  it("excludes past confirmed bookings", () => {
    expect(
      isEligibleForRunningBehindNotify(
        { status: "confirmed", scheduled_at: "2026-10-06T13:00:00.000Z" },
        now,
      ),
    ).toBe(false);
  });

  it("excludes non-confirmed statuses", () => {
    expect(
      isEligibleForRunningBehindNotify(
        { status: "checked_in", scheduled_at: "2026-10-06T16:00:00.000Z" },
        now,
      ),
    ).toBe(false);
  });

  it("anyEligible scans a list", () => {
    expect(
      anyEligibleForRunningBehindNotify(
        [
          { status: "completed", scheduled_at: "2026-10-06T18:00:00.000Z" },
          { status: "confirmed", scheduled_at: "2026-10-06T16:00:00.000Z" },
        ],
        now,
      ),
    ).toBe(true);
  });
});
