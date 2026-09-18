import { isItemAlreadyOwnedError } from "@/lib/iap/apple-iap";

describe("isItemAlreadyOwnedError", () => {
  it("detects expo-iap requestPurchase already-owned message", () => {
    expect(
      isItemAlreadyOwnedError(
        new Error("Calling the 'requestPurchase' function has failed. Caused by: Item already owned"),
      ),
    ).toBe(true);
  });

  it("detects code-based already owned errors", () => {
    expect(isItemAlreadyOwnedError({ code: "already-owned" })).toBe(true);
  });

  it("returns false for unrelated failures", () => {
    expect(isItemAlreadyOwnedError(new Error("Network request failed"))).toBe(false);
  });
});
