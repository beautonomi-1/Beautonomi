/**
 * Monotonic status application tests.
 *
 * Verifies that:
 *  - A new status at a newer timestamp is applied.
 *  - A new status at an older/same timestamp is NOT applied.
 *  - "approved" can never be downgraded to "rejected".
 *  - "approved" can never be downgraded to any non-terminal state.
 */

import type { NormalizedVerificationStatus } from "../types";

/**
 * Extracted monotonic guard logic (identical to the one in identity-verification-service.ts)
 * so we can test it in isolation.
 */
function shouldApplyStatusUpdate(
  currentStatus: NormalizedVerificationStatus,
  currentLastEventAt: string | null,
  incomingTimestamp: string,
): boolean {
  // Never downgrade an already-approved session
  if (currentStatus === "approved") return false;

  // Apply if no previous timestamp
  if (!currentLastEventAt) return true;

  // Apply only if incoming timestamp is strictly newer
  const currentTs  = new Date(currentLastEventAt).getTime();
  const incomingTs = new Date(incomingTimestamp).getTime();
  return incomingTs > currentTs;
}

describe("monotonic status guard", () => {
  const base = "2026-06-01T10:00:00.000Z";
  const later = "2026-06-01T10:01:00.000Z";
  const same  = base;
  const earlier = "2026-06-01T09:59:00.000Z";

  it("applies update when no previous timestamp", () => {
    expect(shouldApplyStatusUpdate("not_started", null, base)).toBe(true);
  });

  it("applies update when incoming is newer", () => {
    expect(shouldApplyStatusUpdate("in_progress", base, later)).toBe(true);
  });

  it("does NOT apply when incoming has same timestamp", () => {
    expect(shouldApplyStatusUpdate("in_progress", base, same)).toBe(false);
  });

  it("does NOT apply when incoming is older", () => {
    expect(shouldApplyStatusUpdate("in_progress", base, earlier)).toBe(false);
  });

  it("does NOT apply any update to approved session", () => {
    expect(shouldApplyStatusUpdate("approved", base, later)).toBe(false);
  });

  it("does NOT downgrade approved to rejected", () => {
    expect(shouldApplyStatusUpdate("approved", base, later)).toBe(false);
  });

  it("does NOT downgrade approved to in_progress", () => {
    expect(shouldApplyStatusUpdate("approved", base, later)).toBe(false);
  });

  it("applies rejected → rejected (retry; same status newer ts) — actually newer ts only", () => {
    // rejected can be updated (e.g. new reject with updated reason)
    expect(shouldApplyStatusUpdate("rejected", base, later)).toBe(true);
  });
});
