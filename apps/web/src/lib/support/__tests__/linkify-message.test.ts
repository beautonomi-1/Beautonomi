import { describe, expect, it } from "vitest";
import { splitMessageWithLinks } from "@beautonomi/utils";

describe("splitMessageWithLinks", () => {
  it("turns https URLs into link segments", () => {
    const parts = splitMessageWithLinks("See https://example.com/help for details");
    expect(parts.some((p) => p.type === "link" && p.value === "https://example.com/help")).toBe(true);
  });

  it("keeps javascript: as plain text", () => {
    const parts = splitMessageWithLinks("bad javascript:alert(1)");
    expect(parts.every((p) => p.type === "text")).toBe(true);
  });
});
