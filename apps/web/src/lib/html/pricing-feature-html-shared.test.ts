import { describe, expect, it } from "vitest";
import { isBlankHtmlContent, stripHtmlToPlainText } from "./pricing-feature-html-shared";

describe("isBlankHtmlContent", () => {
  it("treats empty Quill-like markup as blank", () => {
    expect(isBlankHtmlContent("")).toBe(true);
    expect(isBlankHtmlContent("   ")).toBe(true);
    expect(isBlankHtmlContent("<p><br></p>")).toBe(true);
    expect(isBlankHtmlContent("<p>&nbsp;</p>")).toBe(true);
  });

  it("detects visible text", () => {
    expect(isBlankHtmlContent("<p>Hello</p>")).toBe(false);
    expect(isBlankHtmlContent("Plain")).toBe(false);
  });
});

describe("stripHtmlToPlainText", () => {
  it("removes tags and decodes common entities", () => {
    expect(stripHtmlToPlainText("<p>a &amp; b</p>")).toBe("a & b");
    const br = stripHtmlToPlainText("x<br/>y");
    expect(br).toContain("x");
    expect(br).toContain("y");
  });
});
