import { describe, it, expect } from "vitest";
import { ACCOUNT_HUB_CARDS } from "../account-hub-grid";

describe("ACCOUNT_HUB_CARDS", () => {
  it("includes core account-settings routes and modal actions", () => {
    // Memberships hub card restored at `/account-settings/membership`.
    expect(ACCOUNT_HUB_CARDS.length).toBeGreaterThanOrEqual(24);
    const links = ACCOUNT_HUB_CARDS.map((c) => c.link);
    expect(links).toContain("/account-settings/membership");
    expect(links.filter((l) => l.startsWith("/account-settings")).length).toBeGreaterThan(15);
    expect(links).toContain("/account-settings/personal-info");
    expect(links).toContain("/account-settings/wallet");
    expect(links).toContain("/account-settings/wishlists");
    expect(links).toContain("/account-settings/messages");
    expect(links).toContain("/account-settings/returns");
    expect(links).toContain("#about-us");
    expect(links).toContain("#share-app");
    const actions = ACCOUNT_HUB_CARDS.filter((c) => c.isAction);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.link).sort()).toEqual(["#about-us", "#share-app"].sort());
  });

  it("uses unique hrefs for standard navigation cards (no duplicate routes)", () => {
    const navHrefs = ACCOUNT_HUB_CARDS.filter((c) => !c.isAction).map((c) => c.link);
    const set = new Set(navHrefs);
    expect(set.size).toBe(navHrefs.length);
  });
});
