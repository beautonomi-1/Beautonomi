import { describe, expect, it } from "vitest";
import { FetchError } from "@/lib/http/fetcher";
import { parseReportLoadError } from "../is-subscription-required-error";

describe("parseReportLoadError", () => {
  it("maps SUBSCRIPTION_REQUIRED FetchError to a gate", () => {
    const parsed = parseReportLoadError(
      new FetchError("Staff, products, payments and memberships reports are included on Growth and Scale.", 403, "SUBSCRIPTION_REQUIRED"),
    );
    expect(parsed.subscriptionRequired).toBe(true);
    expect(parsed.message).toContain("Growth");
  });

  it("does not treat generic failures as a subscription gate", () => {
    const parsed = parseReportLoadError(new Error("Failed to load report"));
    expect(parsed.subscriptionRequired).toBe(false);
    expect(parsed.message).toBe("Failed to load report");
  });
});
