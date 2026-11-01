import { describe, expect, it } from "vitest";
import {
  buildSupportTicketsSearchParams,
  matchSupportTicketSavedView,
  mergeSupportTicketSavedViewIntoSearchParams,
  SUPPORT_TICKET_SAVED_VIEWS,
  SUPPORT_TICKET_STATUS_GROUP_ACTIVE,
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
  statusGroup: "",
  channel: "all",
  categoryGroup: "",
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

  it("includes handling_mode=assistant when aiHandling is set", () => {
    const qs = buildSupportTicketsSearchParams({ ...defaults, aiHandling: true });
    expect(qs).toContain("handling_mode=assistant");
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

  it("has an ai_handling view", () => {
    const v = SUPPORT_TICKET_SAVED_VIEWS.find((x) => x.id === "ai_handling");
    expect(v?.params.aiHandling).toBe(true);
  });

  it("has an unassigned view aligned with active count segment", () => {
    const v = SUPPORT_TICKET_SAVED_VIEWS.find((x) => x.id === "unassigned");
    expect(v).toBeDefined();
    expect(v?.params.assign).toBe("unassigned");
    expect(v?.params.statusGroup).toBe(SUPPORT_TICKET_STATUS_GROUP_ACTIVE);
  });

  it("has a breaching_sla view aligned with breaching count segment", () => {
    const v = SUPPORT_TICKET_SAVED_VIEWS.find((x) => x.id === "breaching_sla");
    expect(v).toBeDefined();
    expect(v?.params.slaOverdue).toBe(false);
    expect(v?.params.slaState).toBe("breached");
    expect(v?.params.statusGroup).toBe(SUPPORT_TICKET_STATUS_GROUP_ACTIVE);
  });

  it("has first reply overdue and email channel views", () => {
    expect(
      SUPPORT_TICKET_SAVED_VIEWS.find((x) => x.id === "first_response_overdue")?.params.firstResponseOverdue,
    ).toBe(true);
    expect(SUPPORT_TICKET_SAVED_VIEWS.find((x) => x.id === "channel_email")?.params.channel).toBe("email");
  });
});

describe("mergeSupportTicketSavedViewIntoSearchParams", () => {
  it("hydrates email channel from channel_email preset", () => {
    const n = mergeSupportTicketSavedViewIntoSearchParams(new URLSearchParams("saved_view=channel_email"), "channel_email");
    expect(n.get("channel")).toBe("email");
    expect(n.get("saved_view")).toBe("channel_email");
    expect(n.get("sort")).toBe("updated_desc");
  });

  it("hydrates breaching preset to match count card query", () => {
    const n = mergeSupportTicketSavedViewIntoSearchParams(new URLSearchParams(), "breaching_sla");
    expect(n.get("sla_state")).toBe("breached");
    expect(n.get("status_group")).toBe("active");
    expect(n.get("sla_overdue")).toBeNull();
  });

  it("preserves selected preview and search q when applying a view", () => {
    const n = mergeSupportTicketSavedViewIntoSearchParams(
      new URLSearchParams("selected=abc&q=refund"),
      "needs_response",
    );
    expect(n.get("selected")).toBe("abc");
    expect(n.get("q")).toBe("refund");
    expect(n.get("needs_response")).toBe("1");
  });
});

describe("status_group active", () => {
  it("emits status_group without status", () => {
    const qs = buildSupportTicketsSearchParams({
      ...defaults,
      statusGroup: SUPPORT_TICKET_STATUS_GROUP_ACTIVE,
      status: "open",
    });
    const p = new URLSearchParams(qs);
    expect(p.get("status_group")).toBe("active");
    expect(p.get("status")).toBeNull();
  });
});

describe("matchSupportTicketSavedView", () => {
  it("matches needs_response when channel is all", () => {
    expect(
      matchSupportTicketSavedView({
        ...defaults,
        needsResponse: true,
        channel: "all",
        categoryGroup: "",
      }),
    ).toBe("needs_response");
  });

  it("does not match needs_response when category group is set", () => {
    expect(
      matchSupportTicketSavedView({
        ...defaults,
        needsResponse: true,
        channel: "all",
        categoryGroup: "bookings",
      }),
    ).toBeNull();
  });

  it("matches active queue preset with open count segment", () => {
    expect(
      matchSupportTicketSavedView({
        ...defaults,
        statusGroup: SUPPORT_TICKET_STATUS_GROUP_ACTIVE,
      }),
    ).toBe("all_open");
  });

  it("matches breaching_sla and channel_email presets", () => {
    expect(
      matchSupportTicketSavedView({
        ...defaults,
        slaState: "breached",
        statusGroup: SUPPORT_TICKET_STATUS_GROUP_ACTIVE,
        sort: "sla_asc",
      }),
    ).toBe("breaching_sla");
    expect(
      matchSupportTicketSavedView({
        ...defaults,
        channel: "email",
        sort: "updated_desc",
      }),
    ).toBe("channel_email");
  });
});
