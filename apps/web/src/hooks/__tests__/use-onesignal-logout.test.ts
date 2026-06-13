import { describe, expect, it } from "vitest";

export function shouldClearWebDeviceOnLogout(prevUserId: string | null, nextUserId: string | null): boolean {
  return Boolean(prevUserId && !nextUserId);
}

describe("web OneSignal logout cleanup", () => {
  it("clears device when user signs out", () => {
    expect(shouldClearWebDeviceOnLogout("user-a", null)).toBe(true);
  });

  it("does not clear on initial mount or account switch", () => {
    expect(shouldClearWebDeviceOnLogout(null, "user-a")).toBe(false);
    expect(shouldClearWebDeviceOnLogout("user-a", "user-b")).toBe(false);
  });
});
