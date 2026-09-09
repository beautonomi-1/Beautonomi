import {
  evaluateStoreReviewPrompt,
  STORE_REVIEW_COOLDOWN_MS,
} from "@/lib/store-review-rules";

describe("evaluateStoreReviewPrompt", () => {
  it("returns true for 5 stars first time", () => {
    expect(evaluateStoreReviewPrompt(null, { stars: 5, isEdit: false })).toBe(true);
  });

  it("returns false for 3 stars", () => {
    expect(evaluateStoreReviewPrompt(null, { stars: 3, isEdit: false })).toBe(false);
  });

  it("returns false for edits", () => {
    expect(evaluateStoreReviewPrompt(null, { stars: 5, isEdit: true })).toBe(false);
  });

  it("returns false when dont_ask", () => {
    expect(
      evaluateStoreReviewPrompt(
        { status: "dont_ask", promptCount: 0, lastPromptAt: null, lastHighRatingAt: null },
        { stars: 5, isEdit: false },
      ),
    ).toBe(false);
  });

  it("returns false for second prompt inside 90 days", () => {
    const now = new Date("2026-09-09T12:00:00Z");
    const last = new Date(now.getTime() - STORE_REVIEW_COOLDOWN_MS + 86400000).toISOString();
    expect(
      evaluateStoreReviewPrompt(
        { status: "not_now", promptCount: 1, lastPromptAt: last, lastHighRatingAt: null },
        { stars: 5, isEdit: false, now },
      ),
    ).toBe(false);
  });

  it("returns false after manual rate (rated status)", () => {
    expect(
      evaluateStoreReviewPrompt(
        { status: "rated", promptCount: 0, lastPromptAt: null, lastHighRatingAt: "2026-01-01" },
        { stars: 5, isEdit: false },
      ),
    ).toBe(false);
  });

  it("returns true for a second prompt after 90 days", () => {
    const now = new Date("2026-09-09T12:00:00Z");
    const last = new Date(now.getTime() - STORE_REVIEW_COOLDOWN_MS - 86400000).toISOString();
    expect(
      evaluateStoreReviewPrompt(
        { status: "not_now", promptCount: 1, lastPromptAt: last, lastHighRatingAt: null },
        { stars: 5, isEdit: false, now },
      ),
    ).toBe(true);
  });

  it("returns false after two lifetime prompts even when cooldown elapsed", () => {
    const now = new Date("2026-09-09T12:00:00Z");
    const last = new Date(now.getTime() - STORE_REVIEW_COOLDOWN_MS - 86400000).toISOString();
    expect(
      evaluateStoreReviewPrompt(
        { status: "not_now", promptCount: 2, lastPromptAt: last, lastHighRatingAt: null },
        { stars: 5, isEdit: false, now },
      ),
    ).toBe(false);
  });
});
