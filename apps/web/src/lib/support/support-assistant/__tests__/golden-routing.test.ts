import { describe, expect, it } from "vitest";
import { isSafetySupportCategory, categoryExpectsLinkableRecord } from "../categories";

/** Product-flag rollout guardrails (no LLM). Mirrors packages/agent-evals golden set. */
const GOLDEN = [
  { category: "safety_emergency", safety: true, linkable: false },
  { category: "payment_refund", safety: false, linkable: true },
  { category: "account_delete", safety: false, linkable: false },
] as const;

describe("support-assistant golden routing", () => {
  it("matches safety and linkable expectations", () => {
    for (const row of GOLDEN) {
      expect(isSafetySupportCategory(row.category)).toBe(row.safety);
      expect(categoryExpectsLinkableRecord(row.category)).toBe(row.linkable);
    }
  });
});
