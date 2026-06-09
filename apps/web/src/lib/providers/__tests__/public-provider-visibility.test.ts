import {
  isProviderPubliclyVisible,
  NON_PUBLIC_STATUSES,
} from "@/lib/providers/public-provider-visibility";

describe("public-provider-visibility", () => {
  it("allows active providers without deleted_at", () => {
    expect(isProviderPubliclyVisible({ status: "active", deleted_at: null })).toBe(true);
  });

  it("rejects soft-deleted providers even when status is active", () => {
    expect(
      isProviderPubliclyVisible({ status: "active", deleted_at: "2026-01-01T00:00:00Z" }),
    ).toBe(false);
  });

  it.each(NON_PUBLIC_STATUSES)("rejects non-public status %s", (status) => {
    expect(isProviderPubliclyVisible({ status, deleted_at: null })).toBe(false);
  });
});
