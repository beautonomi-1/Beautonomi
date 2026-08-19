import {
  FROM_RETURN_ROUTES,
  FROM_SAFETY_HUB,
  SAFETY_HUB_HREF,
  matchesFromParam,
  navigateFromSafetyHub,
  resolveFromReturnHref,
} from "@/lib/customer-safety-navigation";

describe("customer-safety-navigation", () => {
  it("resolves from=safety return route", () => {
    expect(resolveFromReturnHref(FROM_SAFETY_HUB)).toBe(SAFETY_HUB_HREF);
    expect(resolveFromReturnHref("profile")).toBe(FROM_RETURN_ROUTES.profile);
    expect(resolveFromReturnHref(undefined)).toBeUndefined();
  });

  it("navigateFromSafetyHub merges from=safety into params", () => {
    const push = jest.fn();
    navigateFromSafetyHub({ push } as never, "/(app)/account-settings/blocked-users", {
      foo: "bar",
    });
    expect(push).toHaveBeenCalledWith({
      pathname: "/(app)/account-settings/blocked-users",
      params: { foo: "bar", from: FROM_SAFETY_HUB },
    });
  });

  it("matches from params", () => {
    expect(matchesFromParam("safety", FROM_SAFETY_HUB)).toBe(true);
    expect(matchesFromParam(["safety"], FROM_SAFETY_HUB)).toBe(true);
    expect(matchesFromParam("profile", FROM_SAFETY_HUB)).toBe(false);
  });
});
