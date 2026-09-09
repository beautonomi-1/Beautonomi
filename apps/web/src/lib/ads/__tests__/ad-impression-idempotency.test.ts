import { describe, it, expect } from "vitest";
import {
  buildAdImpressionHourBucket,
  buildAdImpressionIdempotencyPrefix,
} from "../auction";

describe("buildAdImpressionIdempotencyPrefix", () => {
  it("uses the same prefix within the same UTC hour for the same device and placement", () => {
    const reachKey = "abc123";
    const t1 = new Date("2026-04-01T10:15:00.000Z");
    const t2 = new Date("2026-04-01T10:45:00.000Z");
    expect(buildAdImpressionIdempotencyPrefix("home", reachKey, undefined, t1)).toBe(
      buildAdImpressionIdempotencyPrefix("home", reachKey, undefined, t2),
    );
  });

  it("changes prefix when the hour bucket changes", () => {
    const reachKey = "abc123";
    const hour1 = new Date("2026-04-01T10:59:00.000Z");
    const hour2 = new Date("2026-04-01T11:01:00.000Z");
    expect(buildAdImpressionIdempotencyPrefix("search", reachKey, "hair:1", hour1)).not.toBe(
      buildAdImpressionIdempotencyPrefix("search", reachKey, "hair:1", hour2),
    );
  });

  it("buildAdImpressionHourBucket truncates to the UTC hour", () => {
    const bucket = buildAdImpressionHourBucket(new Date("2026-04-01T10:37:22.000Z"));
    expect(bucket).toBe("2026-04-01T10");
  });
});
