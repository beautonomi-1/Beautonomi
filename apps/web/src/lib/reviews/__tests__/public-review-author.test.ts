import { describe, expect, it } from "vitest";
import { publicReviewAuthor } from "../public-review-author";

describe("publicReviewAuthor", () => {
  it("keeps a real name and does not take a name from an email address", () => {
    const author = publicReviewAuthor({
      id: "abcd1234-0000-4000-8000-000000000001",
      full_name: "Ada Lovelace",
      avatar_url: null,
    });
    expect(author.full_name).toBe("Ada Lovelace");
    expect(author).not.toHaveProperty("email");
  });

  it("uses a short customer label when the name is missing", () => {
    const author = publicReviewAuthor({
      id: "abcd1234-0000-4000-8000-000000000001",
      full_name: null,
    });
    expect(author.full_name).toBe("Customer ABCD");
    expect(author.full_name).not.toContain("@");
  });
});
