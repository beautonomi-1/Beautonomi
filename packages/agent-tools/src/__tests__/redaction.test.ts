import { describe, it, expect } from "vitest";
import { redactObject, truncateOutput } from "../redaction";

describe("redactObject", () => {
  it("redacts sensitive keys case-insensitively", () => {
    expect(redactObject({ Password: "secret", name: "Ada" })).toEqual({
      Password: "[REDACTED]",
      name: "Ada",
    });
  });

  it("redacts nested sensitive values", () => {
    expect(redactObject({ profile: { api_key: "k", city: "JHB" } })).toEqual({
      profile: { api_key: "[REDACTED]", city: "JHB" },
    });
  });
});

describe("truncateOutput", () => {
  it("returns the input when under the byte limit", () => {
    expect(truncateOutput("hello", 10)).toBe("hello");
  });

  it("truncates when over the byte limit", () => {
    const truncated = truncateOutput("hello world", 5);
    expect(truncated.endsWith("…[truncated]")).toBe(true);
    expect(truncated.length).toBeGreaterThan(5);
  });
});
