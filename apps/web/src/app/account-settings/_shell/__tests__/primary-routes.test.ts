import { describe, it, expect } from "vitest";
import { ACCOUNT_QUICK_LINKS, CUSTOMER_PRIMARY_ROUTES } from "../primary-routes";

describe("CUSTOMER_PRIMARY_ROUTES", () => {
  it("includes wishlists hub, recently-viewed sub-route, messages, and returns for shell prefetch", () => {
    expect(CUSTOMER_PRIMARY_ROUTES).toContain("/account-settings/wishlists");
    expect(CUSTOMER_PRIMARY_ROUTES).toContain("/account-settings/wishlists/recently-viewed");
    expect(CUSTOMER_PRIMARY_ROUTES).toContain("/account-settings/messages");
    expect(CUSTOMER_PRIMARY_ROUTES).toContain("/account-settings/returns");
  });

  it("includes the trust & safety and profile-details account pages", () => {
    for (const route of [
      "/account-settings/safety",
      "/account-settings/safety/report-user",
      "/account-settings/age-assurance",
      "/account-settings/content-and-safety",
      "/account-settings/blocked-users",
      "/account-settings/profile-details",
    ]) {
      expect(CUSTOMER_PRIMARY_ROUTES).toContain(route);
    }
  });

  it("lists each route at most once", () => {
    const set = new Set(CUSTOMER_PRIMARY_ROUTES);
    expect(set.size).toBe(CUSTOMER_PRIMARY_ROUTES.length);
  });
});

describe("ACCOUNT_QUICK_LINKS", () => {
  it("includes a Returns chip aligned with prefetch", () => {
    const returns = ACCOUNT_QUICK_LINKS.find((l) => l.href === "/account-settings/returns");
    expect(returns?.label).toBe("Returns");
    expect(CUSTOMER_PRIMARY_ROUTES).toContain("/account-settings/returns");
  });

  it("adds a single Safety chip that does not prefix-match the other new pages", () => {
    const safety = ACCOUNT_QUICK_LINKS.filter((l) => l.href.startsWith("/account-settings/safety"));
    expect(safety).toEqual([{ href: "/account-settings/safety", label: "Safety" }]);
    for (const path of [
      "/account-settings/age-assurance",
      "/account-settings/content-and-safety",
      "/account-settings/blocked-users",
    ]) {
      expect(path.startsWith("/account-settings/safety/")).toBe(false);
    }
  });

  it("uses unique hrefs for chips", () => {
    const hrefs = ACCOUNT_QUICK_LINKS.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
