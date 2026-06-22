import { describe, expect, it } from "vitest";
import { isMailableEmail, isNonMailableEmail } from "./mailable-email";

describe("mailable-email", () => {
  it("flags beautonomi shadow domains as non-mailable", () => {
    expect(isNonMailableEmail("user-abc@beautonomi.local")).toBe(true);
    expect(isNonMailableEmail("walkin+uuid@beautonomi.invalid")).toBe(true);
    expect(isMailableEmail("user-abc@beautonomi.local")).toBe(false);
  });

  it("flags phone.local placeholders as non-mailable", () => {
    expect(isNonMailableEmail("550e8400-e29b-41d4-a716-446655440000@phone.local")).toBe(true);
    expect(isMailableEmail("550e8400-e29b-41d4-a716-446655440000@phone.local")).toBe(false);
  });

  it("treats real user emails as mailable", () => {
    expect(isNonMailableEmail("owner@salon.co.za")).toBe(false);
    expect(isMailableEmail("owner@salon.co.za")).toBe(true);
    expect(isMailableEmail("  owner@salon.co.za  ")).toBe(true);
  });

  it("returns false for empty or invalid input", () => {
    expect(isNonMailableEmail(null)).toBe(false);
    expect(isNonMailableEmail("")).toBe(false);
    expect(isMailableEmail(null)).toBe(false);
    expect(isMailableEmail("not-an-email")).toBe(false);
  });
});
