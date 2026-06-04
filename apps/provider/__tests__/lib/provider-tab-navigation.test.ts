import {
  FROM_RETURN_ROUTES,
  isMoreTabMenuHub,
  isMoreTabNestedScreen,
  matchesFromParam,
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
    expect(resolveFromReturnHref("dashboard")).toBe("/(app)/(tabs)/dashboard");
    expect(resolveFromReturnHref(["bookings"])).toBe("/(app)/(tabs)/bookings");
    expect(resolveFromReturnHref(undefined)).toBeUndefined();
  });

  it("matches from params", () => {
    expect(matchesFromParam("transactions-hub", "transactions-hub")).toBe(true);
    expect(matchesFromParam(["transactions-hub"], "transactions-hub")).toBe(true);
    expect(matchesFromParam("dashboard", "transactions-hub")).toBe(false);
  });
});
