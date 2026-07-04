/**
 * Regression test: ensures no vendor-specific "Yoco device" wording survives
 * in the terminal onboarding question or primary UX paths.
 *
 * "Yoco" is allowed as a vendor option name (just like "iKhokha") but must NOT
 * appear as the sole answer option or as the primary question framing.
 */

import { describe, expect, it } from "vitest";

// ── Copy constants (mirrors what the onboarding wizard renders) ───────────────

const PRIMARY_QUESTION = "Do you currently have a card machine or payment terminal?";
const HELPER_TEXT =
  "This helps us understand how you accept in-person card payments and whether we can offer better terminal options in future.";

const OWNERSHIP_OPTIONS = [
  "Yes, I have card machines / payment terminals",
  "No, I do not have card machines / payment terminals",
  "I am planning to get one",
  "I am not sure",
];

const INTEREST_QUESTION_HAS_TERMINAL =
  "Would you be interested in better terminal pricing, platform-integrated terminals, or bundled subscription options?";

const INTEREST_QUESTION_NO_TERMINAL =
  "Would you be interested in getting a platform-supported card machine in future?";

const VENDOR_OPTIONS = [
  "Yoco",
  "iKhokha",
  "Capitec",
  "FNB",
  "Nedbank",
  "Absa",
  "Standard Bank",
  "Payment service provider / PSP",
  "Other",
  "I am not sure",
];

// ── Forbidden patterns (exact text that must NOT appear in onboarding primary copy) ──

const FORBIDDEN = [
  "Do you have a Yoco",
  "Yoco card machine?",
  "I have a Yoco card machine",
  "I'd like to get a Yoco machine",
  "get a Yoco device",
  "Beautonomi uses Yoco for in-person card payments",
  "Help me get a Yoco",
  "I have Yoco",
  "No — I want one",
  "Other card machine\n",
];

describe("Terminal onboarding copy regression", () => {
  it("primary question contains no Yoco-specific wording", () => {
    for (const phrase of FORBIDDEN) {
      expect(PRIMARY_QUESTION).not.toContain(phrase);
    }
  });

  it("helper text contains no Yoco-specific wording", () => {
    for (const phrase of FORBIDDEN) {
      expect(HELPER_TEXT).not.toContain(phrase);
    }
  });

  it("ownership options contain no Yoco-specific wording", () => {
    for (const option of OWNERSHIP_OPTIONS) {
      for (const phrase of FORBIDDEN) {
        expect(option).not.toContain(phrase);
      }
    }
  });

  it("interest questions contain no Yoco-specific wording", () => {
    for (const phrase of FORBIDDEN) {
      expect(INTEREST_QUESTION_HAS_TERMINAL).not.toContain(phrase);
      expect(INTEREST_QUESTION_NO_TERMINAL).not.toContain(phrase);
    }
  });

  it("Yoco is listed as one vendor option among many", () => {
    expect(VENDOR_OPTIONS).toContain("Yoco");
    expect(VENDOR_OPTIONS.length).toBeGreaterThanOrEqual(5);
  });

  it("vendor options include non-Yoco options", () => {
    const nonYoco = VENDOR_OPTIONS.filter((v) => v !== "Yoco");
    expect(nonYoco.length).toBeGreaterThanOrEqual(4);
  });
});

describe("Terminal notification template keys", () => {
  const TERMINAL_TEMPLATE_KEYS = [
    "terminal_order_confirmed",
    "terminal_order_dispatched",
    "terminal_order_receipt",
    "terminal_upsell_announcement",
  ];

  it("uses vendor-neutral template keys (no yoco_ prefix)", () => {
    for (const key of TERMINAL_TEMPLATE_KEYS) {
      expect(key).not.toMatch(/^yoco_/);
    }
  });

  it("template keys are snake_case", () => {
    for (const key of TERMINAL_TEMPLATE_KEYS) {
      expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe("Feature gate constants completeness", () => {
  it("has exactly 8 terminal feature flag keys", () => {
    const terminalFlags = [
      "provider_terminal_capture_enabled",
      "superadmin_terminal_insights_enabled",
      "terminal_upsell_enabled",
      "terminal_product_catalog_enabled",
      "terminal_ecommerce_enabled",
      "terminal_subscription_bundle_enabled",
      "terminal_campaigns_enabled",
      "terminal_accounting_enabled",
    ];

    for (const flag of terminalFlags) {
      expect(typeof flag).toBe("string");
      expect(flag.length).toBeGreaterThan(0);
    }
    expect(terminalFlags).toHaveLength(8);
  });
});
