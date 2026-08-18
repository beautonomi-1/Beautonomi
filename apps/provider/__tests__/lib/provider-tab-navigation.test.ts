import {
  FROM_RETURN_ROUTES,
  FROM_SAFETY_HUB,
  SAFETY_HUB_HREF,
  isMoreTabMenuHub,
  isMoreTabNestedScreen,
  matchesFromParam,
  navigateFromSafetyHub,
  resolveFromReturnHref,
} from "@/lib/provider-tab-navigation";

describe("provider-tab-navigation", () => {
  it("detects More menu hub paths", () => {
    expect(isMoreTabMenuHub("/(app)/(tabs)/more")).toBe(true);
    expect(isMoreTabMenuHub("/more")).toBe(true);
    expect(isMoreTabMenuHub("/more/")).toBe(true);
  });

  it("detects nested More stack paths", () => {
    expect(isMoreTabNestedScreen("/(app)/(tabs)/more/group-bookings")).toBe(true);
    expect(isMoreTabNestedScreen("/(app)/(tabs)/more/transactions-hub")).toBe(true);
    expect(isMoreTabNestedScreen("/(app)/(tabs)/more/walk-in-sale")).toBe(true);
    expect(isMoreTabNestedScreen("/(app)/(tabs)/more")).toBe(false);
  });

  it("resolves from= query return routes", () => {
    expect(resolveFromReturnHref("transactions-hub")).toBe(FROM_RETURN_ROUTES["transactions-hub"]);
    expect(resolveFromReturnHref(FROM_SAFETY_HUB)).toBe(SAFETY_HUB_HREF);
    expect(resolveFromReturnHref("dashboard")).toBe("/(app)/(tabs)/dashboard");
    expect(resolveFromReturnHref(["bookings"])).toBe("/(app)/(tabs)/bookings");
    expect(resolveFromReturnHref(undefined)).toBeUndefined();
  });

  it("navigateFromSafetyHub merges from=safety into params", () => {
    const push = jest.fn();
    navigateFromSafetyHub({ push } as never, "/(app)/(tabs)/more/settings/blocked-users", {
      foo: "bar",
    });
    expect(push).toHaveBeenCalledWith({
      pathname: "/(app)/(tabs)/more/settings/blocked-users",
      params: { foo: "bar", from: FROM_SAFETY_HUB },
    });
  });

  it("matches from params", () => {
    expect(matchesFromParam("transactions-hub", "transactions-hub")).toBe(true);
    expect(matchesFromParam(["transactions-hub"], "transactions-hub")).toBe(true);
    expect(matchesFromParam("dashboard", "transactions-hub")).toBe(false);
  });
});
