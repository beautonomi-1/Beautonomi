import { stripHtmlToPlainText } from "../src/lib/htmlPlainText";

describe("stripHtmlToPlainText", () => {
  it("strips tags and keeps readable text", () => {
    expect(stripHtmlToPlainText("<p><strong>Pro</strong> plan</p>")).toBe("Pro plan");
  });

  it("handles plain strings", () => {
    expect(stripHtmlToPlainText("No HTML")).toBe("No HTML");
  });
});
