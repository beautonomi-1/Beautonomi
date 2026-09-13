import { describe, expect, it } from "vitest";
import { redactPii } from "@/lib/ai/pii-redact";

describe("redactPii", () => {
  it("redacts emails", () => {
    expect(redactPii("Contact me at user@example.com please")).toContain("[EMAIL]");
  });
  it("redacts phone numbers", () => {
    expect(redactPii("Call 082 555 1234")).toContain("[PHONE]");
  });
  it("redacts SA ID numbers", () => {
    expect(redactPii("ID 9001015800085")).toContain("[ID_NUMBER]");
  });
});
