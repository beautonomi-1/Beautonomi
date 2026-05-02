/**
 * Regression: calendar `time_blocks` wall-clock times must be interpreted in the
 * provider IANA zone (see `combineDateAndTime`), not the Node process timezone.
 */
import { describe, expect, it } from "vitest";
import { combineDateAndTime } from "@/lib/availability/time-utils";

describe("provider calendar wall-clock blocks (ZA)", () => {
  const za = "Africa/Johannesburg";

  it("maps local civil time to the correct UTC instant (SAST = UTC+2)", () => {
    const start = combineDateAndTime("2026-05-02", "10:00:00", za);
    expect(start.toISOString()).toBe("2026-05-02T08:00:00.000Z");
    const end = combineDateAndTime("2026-05-02", "11:30:00", za);
    expect(end.toISOString()).toBe("2026-05-02T09:30:00.000Z");
  });

});
