import { describe, expect, it } from "vitest";

export function shouldReenqueuePartialDelivery(
  userIds: string[],
  maxDelivered: number,
  deviceCountByUser: Map<string, number>,
): boolean {
  if (userIds.length === 1) {
    const expected = deviceCountByUser.get(userIds[0]) ?? 0;
    return expected > 0 && maxDelivered < expected;
  }
  return maxDelivered === 0;
}

describe("partial-delivery reconcile gate", () => {
  it("re-enqueues single-user push when only one of two devices received", () => {
    const map = new Map([["u1", 2]]);
    expect(shouldReenqueuePartialDelivery(["u1"], 1, map)).toBe(true);
  });

  it("skips when all devices received for single-user push", () => {
    const map = new Map([["u1", 2]]);
    expect(shouldReenqueuePartialDelivery(["u1"], 2, map)).toBe(false);
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
