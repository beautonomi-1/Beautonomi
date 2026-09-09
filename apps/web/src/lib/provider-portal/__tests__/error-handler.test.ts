import { describe, expect, it, vi } from "vitest";
import { FetchError } from "@/lib/http/fetcher";
import { getErrorMessage } from "../error-handler";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("getErrorMessage", () => {
  it("uses catalog copy for plan-gate 403s instead of a permission denial", () => {
    const err = new FetchError(
      "You've reached your team member limit on your current plan. Upgrade to add more staff.",
      403,
      "SUBSCRIPTION_LIMIT_EXCEEDED",
    );
    expect(getErrorMessage(err)).toContain("team member limit");
    expect(getErrorMessage(err)).not.toMatch(/don't have permission/i);
  });

  it("keeps a permission message for non-gate 403s", () => {
    const err = new FetchError("Forbidden", 403, "FORBIDDEN");
    expect(getErrorMessage(err)).toMatch(/don't have permission/i);
  });

  it("does not fall back to permission copy when a plan-gate 403 has no message", () => {
    const err = new FetchError("", 403, "SUBSCRIPTION_REQUIRED");
    expect(getErrorMessage(err)).toMatch(/current plan/i);
    expect(getErrorMessage(err)).not.toMatch(/don't have permission/i);
  });
});
