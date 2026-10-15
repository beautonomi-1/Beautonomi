import { describe, expect, it } from "vitest";
import { NAV_GROUPS, navItemContainsHref, rankNavMatches, resolveActiveNavHref } from "./nav";
import { isNavRevealState, NAV_REVEAL_STATE } from "@/lib/navReveal";

describe("resolveActiveNavHref", () => {
  it("picks the most specific item instead of every prefix match", () => {
    expect(resolveActiveNavHref("/finance/ai-queue", NAV_GROUPS)).toBe("/admin/finance/ai-queue");
    expect(resolveActiveNavHref("/finance", NAV_GROUPS)).toBe("/admin/finance");
    expect(resolveActiveNavHref("/settings/feature-flags", NAV_GROUPS)).toBe("/admin/settings/feature-flags");
    expect(resolveActiveNavHref("/providers/distance-settings", NAV_GROUPS)).toBe(
      "/admin/providers/distance-settings",
    );
    expect(resolveActiveNavHref("/control-plane/integrations/didit", NAV_GROUPS)).toBe(
      "/admin/control-plane/integrations/didit",
    );
  });

  it("maps search / Copilot entity deep links to their list page", () => {
    expect(resolveActiveNavHref("/bookings/abc-123", NAV_GROUPS)).toBe("/admin/bookings");
    expect(resolveActiveNavHref("/users/u1", NAV_GROUPS)).toBe("/admin/users");
    expect(resolveActiveNavHref("/providers/p1", NAV_GROUPS)).toBe("/admin/providers");
    expect(resolveActiveNavHref("/provider-ops/leads/l1", NAV_GROUPS)).toBe("/admin/provider-ops/leads");
    expect(resolveActiveNavHref("/support-tickets/t1", NAV_GROUPS)).toBe("/admin/support-tickets");
    expect(resolveActiveNavHref("/brand/campaigns/c1", NAV_GROUPS)).toBe("/admin/brand");
  });

  it("does not treat sibling prefixes as matches", () => {
    expect(resolveActiveNavHref("/finance-other", NAV_GROUPS)).toBeNull();
  });

  it("tolerates trailing slashes and an /admin prefix", () => {
    expect(resolveActiveNavHref("/bookings/", NAV_GROUPS)).toBe("/admin/bookings");
    expect(resolveActiveNavHref("/admin/bookings", NAV_GROUPS)).toBe("/admin/bookings");
  });

  it("hub rows contain their active child", () => {
    const finance = NAV_GROUPS.find((g) => g.label === "Finance")!.items[0]!;
    expect(navItemContainsHref(finance, "/admin/refunds")).toBe(true);
    expect(navItemContainsHref(finance, "/admin/bookings")).toBe(false);
  });
});

describe("rankNavMatches", () => {
  it("ranks title prefix before substring and shows the parent hub", () => {
    const matches = rankNavMatches("refund", NAV_GROUPS);
    expect(matches[0]?.href).toBe("/admin/refunds");
    expect(matches[0]?.group).toBe("Finance");
    expect(rankNavMatches("lead inbox", NAV_GROUPS)[0]?.group).toBe("Provider Ops › Provider Ops Dashboard");
  });

  it("ignores queries shorter than two characters", () => {
    expect(rankNavMatches("r", NAV_GROUPS)).toEqual([]);
  });
});

describe("nav reveal state", () => {
  it("recognises reveal router state only", () => {
    expect(isNavRevealState(NAV_REVEAL_STATE)).toBe(true);
    expect(isNavRevealState({ from: "/x" })).toBe(false);
    expect(isNavRevealState(null)).toBe(false);
  });
});
