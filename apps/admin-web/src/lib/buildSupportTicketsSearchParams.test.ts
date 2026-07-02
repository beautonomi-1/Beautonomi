import { describe, expect, it } from "vitest";
import {
  buildSupportTicketsSearchParams,
  SUPPORT_TICKET_SAVED_VIEWS,
} from "./buildSupportTicketsSearchParams";

const defaults = {
  pageIndex: 0,
  status: "all",
  priority: "all",
  category: "all",
  assign: "all",
  q: "",
  staffUserId: undefined,
  sort: "smart",
  slaOverdue: false,
  needsResponse: false,
  slaState: "",
  firstResponseOverdue: false,
} as const;

describe("buildSupportTicketsSearchParams", () => {
  it("uses smart sort by default (no sort param emitted)", () => {
    const qs = buildSupportTicketsSearchParams(defaults);
    const p = new URLSearchParams(qs);
    // "smart" is the default so it should NOT be emitted
    expect(p.get("sort")).toBeNull();
  });

  it("emits sort param when not smart", () => {
    const qs = buildSupportTicketsSearchParams({ ...defaults, sort: "updated_desc" });
    const p = new URLSearchParams(qs);
    expect(p.get("sort")).toBe("updated_desc");
  });

  it("emits needs_response=1 when needsResponse is true", () => {
    const qs = buildSupportTicketsSearchParams({ ...defaults, needsResponse: true });
    const p = new URLSearchParams(qs);
    expect(p.get("needs_response")).toBe("1");
  });

  it("does not emit needs_response when false", () => {
    const qs = buildSupportTicketsSearchParams(defaults);
    const p = new URLSearchParams(qs);
    expect(p.get("needs_response")).toBeNull();
  });

  it("emits sla_state when set", () => {
    const qs = buildSupportTicketsSearchParams({ ...defaults, slaState: "at_risk" });
    const p = new URLSearchParams(qs);
    expect(p.get("sla_state")).toBe("at_risk");
  });

  it("emits first_response_overdue=1 when set", () => {
    const qs = buildSupportTicketsSearchParams({ ...defaults, firstResponseOverdue: true });
    const p = new URLSearchParams(qs);
    expect(p.get("first_response_overdue")).toBe("1");
  });

  it("includes pagination and filters", () => {
    const qs = buildSupportTicketsSearchParams({
      ...defaults,
      pageIndex: 1,
      status: "open",
      priority: "high",
      category: "booking_issue",
      assign: "unassigned",
      q: "refund",
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

  it("sets assigned_to to staffUserId for 'mine'", () => {
    const qs = buildSupportTicketsSearchParams({
      ...defaults,
      assign: "mine",
      staffUserId: "user-123",
    });
    const p = new URLSearchParams(qs);
    expect(p.get("assigned_to")).toBe("user-123");
  });

  it("omits assigned_to for 'mine' when no staffUserId", () => {
    const qs = buildSupportTicketsSearchParams({
      ...defaults,
      assign: "mine",
      staffUserId: undefined,
    });
    const p = new URLSearchParams(qs);
    expect(p.get("assigned_to")).toBeNull();
  });
});

describe("SUPPORT_TICKET_SAVED_VIEWS", () => {
  it("has a needs_response view as first entry", () => {
    expect(SUPPORT_TICKET_SAVED_VIEWS[0]?.id).toBe("needs_response");
    expect(SUPPORT_TICKET_SAVED_VIEWS[0]?.params.needsResponse).toBe(true);
  });

  it("has an unassigned view", () => {
    const v = SUPPORT_TICKET_SAVED_VIEWS.find((x) => x.id === "unassigned");
    expect(v).toBeDefined();
    expect(v?.params.assign).toBe("unassigned");
  });

  it("has a breaching_sla view using at_risk sla_state", () => {
    const v = SUPPORT_TICKET_SAVED_VIEWS.find((x) => x.id === "breaching_sla");
    expect(v).toBeDefined();
    expect(v?.params.slaState).toBe("at_risk");
  });
});
