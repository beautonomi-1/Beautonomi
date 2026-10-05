import { describe, expect, it } from "vitest";
import {
  appendAuthReturnToBookingNext,
  resolveGatePostLoginNext,
} from "../BeautonomiGateModal";

describe("appendAuthReturnToBookingNext", () => {
  it("appends auth_return=1 to booking paths with existing query", () => {
    expect(appendAuthReturnToBookingNext("/booking?slug=test&step=pay")).toBe(
      "/booking?slug=test&step=pay&auth_return=1",
    );
  });

  it("appends auth_return=1 when query is empty", () => {
    expect(appendAuthReturnToBookingNext("/booking")).toBe("/booking?auth_return=1");
  });

  it("leaves non-relative paths unchanged", () => {
    expect(appendAuthReturnToBookingNext("https://evil.example/booking")).toBe(
      "https://evil.example/booking",
    );
  });
});

describe("resolveGatePostLoginNext", () => {
  it("includes auth_return on explicit booking redirect", () => {
    const next = resolveGatePostLoginNext("/booking?slug=e2e-test-provider-beautonomi&step=yourInfo");
    expect(next).toContain("auth_return=1");
    expect(next).toContain("slug=e2e-test-provider-beautonomi");
  });
});
