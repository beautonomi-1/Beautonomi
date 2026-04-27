import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getHoldTimeRemaining,
  serverNowToClockOffsetMs,
} from "./holdTimeRemaining";

describe("holdTimeRemaining", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("avoids a false 'expired' when the device clock is ahead of the server (customer still has time on server)", () => {
    vi.setSystemTime(new Date("2026-01-15T12:02:00.000Z"));
    const serverNow = "2026-01-15T12:00:00.000Z";
    const offset = serverNowToClockOffsetMs(serverNow);
    const expires = "2026-01-15T12:01:00.000Z";
    expect(getHoldTimeRemaining(expires, 0).expired).toBe(true);
    const withOffset = getHoldTimeRemaining(expires, offset);
    expect(withOffset.expired).toBe(false);
    expect(withOffset.minutes).toBe(1);
  });

  it("aligns with server when the device clock lags (does not show a cushion after server expiry)", () => {
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
    const serverNow = "2026-01-15T12:02:00.000Z";
    const offset = serverNowToClockOffsetMs(serverNow);
    const expires = "2026-01-15T12:01:30.000Z";
    const naive = getHoldTimeRemaining(expires, 0);
    expect(naive.expired).toBe(false);
    expect(naive.minutes).toBe(1);
    const aligned = getHoldTimeRemaining(expires, offset);
    expect(aligned.expired).toBe(true);
  });

  it("returns 0 offset for invalid server_now", () => {
    expect(serverNowToClockOffsetMs(undefined)).toBe(0);
    expect(serverNowToClockOffsetMs("")).toBe(0);
  });
});
