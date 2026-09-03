import { describe, it, expect } from "vitest";
import { redactPromptObject, redactPromptText } from "../redact-prompt-pii";

describe("redactPromptText", () => {
  it("masks emails, phone numbers, card numbers and SA ID numbers", () => {
    const text =
      "Hi, I'm Thandi (thandi.m@example.com, +27 82 123 4567). My card 4111 1111 1111 1111 was charged twice. ID 9001015009087.";
    const out = redactPromptText(text);
    expect(out).not.toContain("thandi.m@example.com");
    expect(out).not.toContain("82 123 4567");
    expect(out).not.toContain("4111 1111 1111 1111");
    expect(out).not.toContain("9001015009087");
    expect(out).toContain("[EMAIL]");
    expect(out).toContain("[PHONE]");
    expect(out).toContain("[CARD]");
    expect(out).toContain("[ID_NUMBER]");
    // Names and the complaint itself survive so the model can still triage.
    expect(out).toContain("Thandi");
    expect(out).toContain("charged twice");
  });

  it("is safe on empty input and idempotent", () => {
    expect(redactPromptText("")).toBe("");
    expect(redactPromptText(null)).toBe("");
    const once = redactPromptText("call me on 0821234567");
    expect(redactPromptText(once)).toBe(once);
  });
});

describe("redactPromptObject", () => {
  it("masks sensitive keys and scrubs PII inside nested string values", () => {
    const out = redactPromptObject({
      booking: { booking_number: "BK-1", customer_email: "a@b.co", note: "ring 011 555 1234" },
      api_key: "secret-key",
      tags: ["mail me at x@y.org"],
    }) as Record<string, any>;
    expect(out.api_key).toBe("[REDACTED]");
    expect(out.booking.booking_number).toBe("BK-1");
    expect(out.booking.customer_email).toBe("[EMAIL]");
    expect(out.booking.note).toContain("[PHONE]");
    expect(out.tags[0]).toContain("[EMAIL]");
  });
});
