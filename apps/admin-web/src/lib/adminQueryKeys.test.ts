import { describe, expect, it } from "vitest";
import { adminQueryKeys } from "./adminQueryKeys";

describe("adminQueryKeys", () => {
  it("prefixes every key with admin root", () => {
    expect(adminQueryKeys.root).toEqual(["admin"]);
    expect(adminQueryKeys.bootstrap()[0]).toBe("admin");
    expect(adminQueryKeys.bookings.list({ statusFilter: "a", dateFilter: "b" })[0]).toBe("admin");
    expect(adminQueryKeys.providers.distanceList()[0]).toBe("admin");
  });

  it("keeps bookings detail keys stable per id", () => {
    expect(adminQueryKeys.bookings.detail("bk_1")).toEqual(["admin", "bookings", "detail", "bk_1"]);
  });

  it("includes filter params in list keys for correct cache separation", () => {
    const a = adminQueryKeys.bookings.list({ statusFilter: "open", dateFilter: "today" });
    const b = adminQueryKeys.bookings.list({ statusFilter: "done", dateFilter: "today" });
    expect(a).not.toEqual(b);
  });

  it("serializes support ticket search string into list key", () => {
    expect(adminQueryKeys.supportTickets.list("q=foo&status=open")).toEqual([
      "admin",
      "support-tickets",
      "list",
      "q=foo&status=open",
    ]);
  });

  it("scopes finance and report keys under admin root", () => {
    expect(adminQueryKeys.finance.summary("a|b")).toEqual(["admin", "finance", "summary", "a|b", ""]);
    expect(adminQueryKeys.finance.summary("a|b", "prov-1")).toEqual([
      "admin",
      "finance",
      "summary",
      "a|b",
      "prov-1",
    ]);
    expect(adminQueryKeys.finance.trialBalance("2026-01|2026-01")).toEqual([
      "admin",
      "finance",
      "trial-balance",
      "2026-01|2026-01",
    ]);
    expect(adminQueryKeys.reports.detail("revenue", "30d")).toEqual(["admin", "reports", "revenue", "30d"]);
    expect(adminQueryKeys.payouts.list({ page: 2, status: "pending" })).toEqual([
      "admin",
      "payouts",
      "list",
      { page: 2, status: "pending" },
    ]);
  });

  it("scopes provider detail and refunds list keys", () => {
    expect(adminQueryKeys.providers.detail("p1")).toEqual(["admin", "providers", "detail", "p1"]);
    expect(adminQueryKeys.refunds({ page: 1, status: "all" })).toEqual([
      "admin",
      "refunds",
      "list",
      { page: 1, status: "all" },
    ]);
  });
});
