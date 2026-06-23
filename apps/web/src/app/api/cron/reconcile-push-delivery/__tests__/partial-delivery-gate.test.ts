import { describe, expect, it } from "vitest";

/**
 * §fix-device-math: For single-user groups, any delivery (maxDelivered >= 1)
 * counts as success. The old `maxDelivered < expected` logic required ALL
 * registered devices to receive the push, which caused dead/stale devices to
 * keep the condition permanently true and re-enqueue indefinitely.
 */
export function shouldReenqueuePartialDelivery(
  userIds: string[],
  maxDelivered: number,
  deviceCountByUser: Map<string, number>,
): boolean {
  if (userIds.length === 1) {
    const expected = deviceCountByUser.get(userIds[0]) ?? 0;
    // Only retry if NO device received the push at all, not merely < expected.
    return expected > 0 && maxDelivered === 0;
  }
  return maxDelivered === 0;
}

describe("partial-delivery reconcile gate", () => {
  it("does NOT re-enqueue single-user push when at least one device received it", () => {
    // User has 2 devices; 1 received — that is a successful delivery.
    // Previously this re-enqueued, creating the stale-device retry loop.
    const map = new Map([["u1", 2]]);
    expect(shouldReenqueuePartialDelivery(["u1"], 1, map)).toBe(false);
  });

  it("re-enqueues single-user push when zero devices received it", () => {
    const map = new Map([["u1", 2]]);
    expect(shouldReenqueuePartialDelivery(["u1"], 0, map)).toBe(true);
  });

  it("skips when all devices received for single-user push", () => {
    const map = new Map([["u1", 2]]);
    expect(shouldReenqueuePartialDelivery(["u1"], 2, map)).toBe(false);
  });

  it("skips when user has no reachable devices", () => {
    const map = new Map<string, number>(); // empty — no reachable devices
    expect(shouldReenqueuePartialDelivery(["u1"], 0, map)).toBe(false);
  });

  it("keeps zero-delivery rule for multi-recipient fan-out", () => {
    const map = new Map([
      ["u1", 1],
      ["u2", 1],
    ]);
    expect(shouldReenqueuePartialDelivery(["u1", "u2"], 0, map)).toBe(true);
    expect(shouldReenqueuePartialDelivery(["u1", "u2"], 1, map)).toBe(false);
  });
});
