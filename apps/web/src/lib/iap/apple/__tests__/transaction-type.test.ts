import { describe, expect, it } from "vitest";
import { resolveAppleIapTransactionType } from "@/lib/iap/apple/entitlement-bridge";

describe("resolveAppleIapTransactionType", () => {
  it("uses the subscription type so the lineage unique index applies", () => {
    expect(resolveAppleIapTransactionType("subscription", undefined)).toBe(
      "Auto-Renewable Subscription",
    );
    expect(resolveAppleIapTransactionType("subscription", "Consumable")).toBe(
      "Auto-Renewable Subscription",
    );
  });

  it("uses Consumable for ads packs even if Apple omits type", () => {
    expect(resolveAppleIapTransactionType("consumable", undefined)).toBe("Consumable");
  });

  it("keeps Apple's type for unmapped products", () => {
    expect(resolveAppleIapTransactionType("unknown", "Non-Consumable")).toBe("Non-Consumable");
    expect(resolveAppleIapTransactionType("unknown", "  ")).toBe("Unknown");
  });
});
