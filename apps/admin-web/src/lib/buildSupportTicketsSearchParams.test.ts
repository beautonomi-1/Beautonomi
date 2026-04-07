import { describe, expect, it } from "vitest";
import { buildSupportTicketsSearchParams } from "./buildSupportTicketsSearchParams";

describe("buildSupportTicketsSearchParams", () => {
  it("includes pagination and filters", () => {
    const qs = buildSupportTicketsSearchParams({
      pageIndex: 1,
      status: "open",
      priority: "high",
      category: "booking_issue",
      assign: "unassigned",
      q: "refund",
      staffUserId: "u1",
      sort: "updated_desc",
      slaOverdue: false,
    });
    const p = new URLSearchParams(qs);
    expect(p.get("limit")).toBe("25");
    expect(p.get("offset")).toBe("25");
    expect(p.get("status")).toBe("open");
    expect(p.get("priority")).toBe("high");
    expect(p.get("category")).toBe("booking_issue");
    expect(p.get("assigned_to")).toBe("unassigned");
    expect(p.get("q")).toBe("refund");
  });

  it("omits defaults and sets mine assignee", () => {
    const qs = buildSupportTicketsSearchParams({
      pageIndex: 0,
      status: "all",
      priority: "all",
      category: "all",
      assign: "mine",
      q: "",
      staffUserId: "abc",
      sort: "updated_desc",
      slaOverdue: false,
    });
    const p = new URLSearchParams(qs);
    expect(p.get("offset")).toBe("0");
    expect(p.get("status")).toBeNull();
    expect(p.get("assigned_to")).toBe("abc");
    expect(p.get("q")).toBeNull();
  });
});
