import { describe, expect, it } from "vitest";
import {
  BREADCRUMB_MAP,
  applyBreadcrumbSuffix,
  breadcrumbsForPath,
  normalisePath,
} from "./breadcrumbMap";

const UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("normalisePath", () => {
  it("strips the absolute /admin/ prefix", () => {
    expect(normalisePath("/admin/bookings")).toBe("bookings");
  });

  it("strips a basename-relative leading slash (React Router basename='/admin')", () => {
    // useLocation().pathname returns basename-relative paths like `/bookings`.
    expect(normalisePath("/bookings")).toBe("bookings");
  });

  it("normalises UUID dynamic segments to [id]", () => {
    expect(normalisePath(`/bookings/${UUID}`)).toBe("bookings/[id]");
    expect(normalisePath(`/admin/providers/${UUID}`)).toBe("providers/[id]");
  });

  it("normalises long opaque id segments to [id]", () => {
    expect(normalisePath("/users/abcdefghijklmnopqrstuvwxyz")).toBe("users/[id]");
  });

  it("handles trailing slashes and empty segments", () => {
    expect(normalisePath("/admin/bookings/")).toBe("bookings");
    expect(normalisePath("//bookings//")).toBe("bookings");
  });

  it("strips query and hash before matching", () => {
    expect(normalisePath("/support-tickets?view=table&status=open")).toBe("support-tickets");
    expect(normalisePath(`/support-tickets/${UUID}#message-1`)).toBe("support-tickets/[id]");
  });
});

describe("breadcrumbsForPath", () => {
  it("returns a single crumb for a top-level section (hidden by the UI)", () => {
    const crumbs = breadcrumbsForPath("/dashboard");
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0].label).toBe("Dashboard");
  });

  it("builds a parent → leaf trail for detail pages (basename-relative path)", () => {
    const crumbs = breadcrumbsForPath(`/bookings/${UUID}`);
    expect(crumbs.map((c) => c.label)).toEqual(["Bookings", "Booking"]);
  });

  it("builds the same trail for an absolute /admin path", () => {
    const crumbs = breadcrumbsForPath(`/admin/bookings/${UUID}`);
    expect(crumbs.map((c) => c.label)).toEqual(["Bookings", "Booking"]);
  });

  it("applies the leaf label override on detail pages", () => {
    const crumbs = breadcrumbsForPath(`/providers/${UUID}`, "Acme Salon");
    expect(crumbs.map((c) => c.label)).toEqual(["Providers", "Acme Salon"]);
  });

  it("walks multi-level parents (provider-ops lead detail)", () => {
    const crumbs = breadcrumbsForPath(`/provider-ops/leads/${UUID}`);
    expect(crumbs.map((c) => c.label)).toEqual(["Dashboard", "Lead Inbox", "Lead"]);
  });

  it("returns an empty trail for unknown paths", () => {
    expect(breadcrumbsForPath("/this/route/does/not/exist")).toEqual([]);
  });

  it("integrations hub is a single crumb (bar hidden in UI)", () => {
    expect(breadcrumbsForPath("/integrations-hub")).toHaveLength(1);
  });

  it("connector pages trail through Integrations hub", () => {
    expect(breadcrumbsForPath("/integrations/resend").map((c) => c.label)).toEqual([
      "Integrations",
      "Resend",
    ]);
    expect(breadcrumbsForPath("/integrations/paycloud-operations").map((c) => c.label)).toEqual([
      "Integrations",
      "PayCloud Card Machines",
      "PayCloud Operations",
    ]);
  });

  it("control-plane integration pages trail through Platform integrations", () => {
    expect(breadcrumbsForPath("/control-plane/integrations/stripe").map((c) => c.label)).toEqual([
      "Platform Advanced",
      "Platform integrations",
      "Stripe",
    ]);
  });

  it("region gateway trails from Platform Advanced", () => {
    expect(breadcrumbsForPath("/control-plane/region-online-gateway").map((c) => c.label)).toEqual([
      "Platform Advanced",
      "Region online gateway",
    ]);
  });

  it("support queue trails from Dashboard", () => {
    expect(breadcrumbsForPath("/support-tickets").map((c) => c.label)).toEqual([
      "Dashboard",
      "Support Tickets",
    ]);
  });

  it("support ticket detail resolves parent href with query string", () => {
    const parent = "/support-tickets?view=table&status=open";
    const crumbs = breadcrumbsForPath(`/support-tickets/${UUID}`, "1042", parent);
    expect(crumbs.map((c) => c.label)).toEqual(["Dashboard", "Support Tickets", "1042"]);
    expect(crumbs[1].href).toBe(parent);
    expect(crumbs[1].href).toContain("view=table");
  });
});

describe("applyBreadcrumbSuffix", () => {
  it("appends the selected ticket and rewrites the queue href", () => {
    const base = breadcrumbsForPath("/support-tickets");
    const next = applyBreadcrumbSuffix(base, {
      label: "T-1042",
      previousHref: "/support-tickets?status=open",
      currentHref: "/support-tickets?status=open&selected=abc",
    });
    expect(next.map((c) => c.label)).toEqual(["Dashboard", "Support Tickets", "T-1042"]);
    expect(next[1].href).toBe("/support-tickets?status=open");
    expect(next[2].href).toBe("/support-tickets?status=open&selected=abc");
  });
});

describe("BREADCRUMB_MAP integrity", () => {
  it("every parentHref resolves to a known map entry", () => {
    const unresolved: string[] = [];
    for (const [key, route] of Object.entries(BREADCRUMB_MAP)) {
      if (route.parentHref == null) continue;
      const parentNorm = normalisePath(route.parentHref);
      if (!BREADCRUMB_MAP[parentNorm]) {
        unresolved.push(`${key} → ${route.parentHref} (normalised: ${parentNorm})`);
      }
    }
    expect(unresolved, `Dangling parentHref references:\n${unresolved.join("\n")}`).toEqual([]);
  });
});
