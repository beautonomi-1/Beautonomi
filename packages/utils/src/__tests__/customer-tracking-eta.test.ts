import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerEtaUiParts } from "../customer-tracking-eta";

describe("getCustomerEtaUiParts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks a passed ETA as running late", () => {
    const parts = getCustomerEtaUiParts("2026-09-02T11:50:00.000Z");
    expect(parts.show).toBe(true);
    expect(parts.isLate).toBe(true);
    expect(parts.minutesLabel).toBe("Running a little late");
  });

  it("shows remaining minutes when the ETA is still ahead", () => {
    const parts = getCustomerEtaUiParts("2026-09-02T12:20:00.000Z");
    expect(parts.show).toBe(true);
    expect(parts.isLate).toBe(false);
    expect(parts.minutesLabel).toBe("~20 min");
  });
});
