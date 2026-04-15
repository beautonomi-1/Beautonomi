import { describe, expect, it } from "vitest";
import { sanitizeLearnArticleHtml } from "./learn-article-html";

describe("sanitizeLearnArticleHtml", () => {
  it("keeps YouTube iframe src on allowed host", () => {
    const html =
      '<div class="learn-embed-video"><iframe src="https://www.youtube-nocookie.com/embed/abc123" title="t"></iframe></div>';
    expect(sanitizeLearnArticleHtml(html)).toContain("youtube-nocookie.com");
  });

  it("drops iframe src on unknown host", () => {
    const html = '<iframe src="https://evil.example/embed"></iframe>';
    const out = sanitizeLearnArticleHtml(html);
    expect(out).not.toContain("evil.example");
    expect(out).not.toMatch(/src=/);
  });

  it("strips script tags", () => {
    expect(sanitizeLearnArticleHtml('<p>Hi</p><script>alert(1)</script>')).toBe("<p>Hi</p>");
  });
});
