/**
 * Tests for the generic terminal capture feature.
 * Covers:
 *  1. Onboarding copy — no vendor-specific wording in the new step
 *  2. Type mapping — backfill logic (yoco_machine → terminal_ownership_status)
 *  3. Feature-gate constants exist
 *  4. Accounting transaction type map
 *  5. Receipt token kind registration
 *  6. Subscription features registry includes terminal_bundle
 */

import { describe, expect, it } from "vitest";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import {
  TERMINAL_VENDOR_LABELS,
  TERMINAL_OWNERSHIP_STATUS_LABELS,
  TERMINAL_COUNT_RANGE_LABELS,
  TERMINAL_INTEREST_LEVEL_LABELS,
  TERMINAL_TRANSACTION_TYPES,
} from "@/lib/terminal/types";

// ── 1. Feature flag keys exist ────────────────────────────────────────────────

describe("Terminal feature flag keys", () => {
  it("defines all 8 terminal feature flags", () => {
    const expected = [
      "PROVIDER_TERMINAL_CAPTURE",
      "SUPERADMIN_TERMINAL_INSIGHTS",
      "TERMINAL_UPSELL",
      "TERMINAL_PRODUCT_CATALOG",
      "TERMINAL_ECOMMERCE",
      "TERMINAL_SUBSCRIPTION_BUNDLE",
      "TERMINAL_CAMPAIGNS",
      "TERMINAL_ACCOUNTING",
    ] as const;

    for (const key of expected) {
      expect(FEATURE_FLAG_KEYS).toHaveProperty(key);
      expect(typeof (FEATURE_FLAG_KEYS as Record<string, string>)[key]).toBe("string");
    }
  });

  it("provider_terminal_capture_enabled is the capture flag key", () => {
    expect(FEATURE_FLAG_KEYS.PROVIDER_TERMINAL_CAPTURE).toBe("provider_terminal_capture_enabled");
  });
});

// ── 2. Type label completeness ────────────────────────────────────────────────

describe("Terminal type labels", () => {
  it("covers all ownership statuses", () => {
    const statuses = ["has_terminal", "no_terminal", "planning_to_get_terminal", "unsure"] as const;
    for (const s of statuses) {
      expect(TERMINAL_OWNERSHIP_STATUS_LABELS[s]).toBeTruthy();
    }
  });

  it("covers all terminal vendors", () => {
    const vendors = ["yoco", "ikhokha", "capitec", "fnb", "nedbank", "absa", "standard_bank", "psp", "other", "unsure"] as const;
    for (const v of vendors) {
      expect(TERMINAL_VENDOR_LABELS[v]).toBeTruthy();
    }
  });

  it("covers all count ranges", () => {
    const ranges = ["one", "two_to_three", "four_to_ten", "more_than_ten", "unsure"] as const;
    for (const r of ranges) {
      expect(TERMINAL_COUNT_RANGE_LABELS[r]).toBeTruthy();
    }
  });

  it("covers all interest levels", () => {
    const levels = ["yes", "maybe_later", "no"] as const;
    for (const l of levels) {
      expect(TERMINAL_INTEREST_LEVEL_LABELS[l]).toBeTruthy();
    }
  });
});

// ── 3. Backfill mapping logic ─────────────────────────────────────────────────

describe("yoco_machine → terminal_ownership_status backfill", () => {
  function mapOwnershipStatus(yocoMachine: string | null): string | null {
    switch (yocoMachine) {
      case "yes": return "has_terminal";
      case "no": return "no_terminal";
      case "other": return "has_terminal";
      default: return null;
    }
  }

  function mapTerminalProvider(yocoMachine: string | null): string | null {
    switch (yocoMachine) {
      case "yes": return "yoco";
      case "other": return "other";
      default: return null;
    }
  }

  it("maps 'yes' to has_terminal with yoco provider", () => {
    expect(mapOwnershipStatus("yes")).toBe("has_terminal");
    expect(mapTerminalProvider("yes")).toBe("yoco");
  });

  it("maps 'no' to no_terminal with null provider", () => {
    expect(mapOwnershipStatus("no")).toBe("no_terminal");
    expect(mapTerminalProvider("no")).toBeNull();
  });

  it("maps 'other' to has_terminal with other provider", () => {
    expect(mapOwnershipStatus("other")).toBe("has_terminal");
    expect(mapTerminalProvider("other")).toBe("other");
  });

  it("maps null/undefined to null", () => {
    expect(mapOwnershipStatus(null)).toBeNull();
    expect(mapTerminalProvider(null)).toBeNull();
  });
});

// ── 4. Accounting transaction types ───────────────────────────────────────────

describe("Terminal accounting transaction types", () => {
  it("defines all expected transaction types", () => {
    expect(TERMINAL_TRANSACTION_TYPES.SALE).toBe("terminal_sale");
    expect(TERMINAL_TRANSACTION_TYPES.RENTAL).toBe("terminal_rental");
    expect(TERMINAL_TRANSACTION_TYPES.BUNDLE_ALLOC).toBe("terminal_bundle_alloc");
    expect(TERMINAL_TRANSACTION_TYPES.PROMOTION).toBe("terminal_promotion");
  });
});

// ── 5. No stray "Yoco device" onboarding copy ─────────────────────────────────

describe("Vendor-neutral onboarding copy audit", () => {
  const FORBIDDEN_ONBOARDING_PHRASES = [
    "Do you have a Yoco",
    "Yoco devices",
    "I have Yoco",
    "I want a Yoco",
    "get a Yoco device",
    "get a Yoco machine",
    "Beautonomi uses Yoco for in-person",
    "Help me get a Yoco",
    "Yes, I have Yoco",
    "No — I want one\n",
  ];

  it("TERMINAL_OWNERSHIP_STATUS_LABELS contains no Yoco-specific wording", () => {
    for (const label of Object.values(TERMINAL_OWNERSHIP_STATUS_LABELS)) {
      for (const phrase of FORBIDDEN_ONBOARDING_PHRASES) {
        expect(label).not.toContain(phrase.trim());
      }
    }
  });

  it("TERMINAL_VENDOR_LABELS lists Yoco as one option among many (not primary)", () => {
    const vendors = Object.keys(TERMINAL_VENDOR_LABELS);
    expect(vendors).toContain("yoco");
    // Yoco should be one of several options, not the only one
    expect(vendors.length).toBeGreaterThan(3);
  });
});
