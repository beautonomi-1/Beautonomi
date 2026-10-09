import { describe, expect, it } from "vitest";
import { emailIntegrationTestBodySchema } from "../test/route";

describe("email-integration test body schema", () => {
  it("accepts ping only", () => {
    expect(emailIntegrationTestBodySchema.parse({ ping: true })).toEqual({ ping: true });
  });

  it("accepts test_email only", () => {
    expect(emailIntegrationTestBodySchema.parse({ test_email: "a@example.com" })).toEqual({
      test_email: "a@example.com",
    });
  });

  it("rejects both ping and test_email", () => {
    expect(() =>
      emailIntegrationTestBodySchema.parse({ ping: true, test_email: "a@example.com" }),
    ).toThrow();
  });

  it("rejects neither ping nor test_email", () => {
    expect(() => emailIntegrationTestBodySchema.parse({})).toThrow();
  });
});
