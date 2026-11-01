import {
  createDefaultSavedViewMatcher,
  matchAdminSavedView,
  type AdminSavedView,
} from "@/lib/adminSavedViews";

const PAGE_SIZE = 25;

export interface SupportTicketsFilterState {
  pageIndex: number;
  status: string;
  priority: string;
  category: string;
  assign: string;
  /** Server-side search (debounced in UI). */
  q: string;
  staffUserId: string | undefined;
  /** Sort key for GET /api/admin/support-tickets */
  sort: string;
  /** Only tickets past SLA and not resolved/closed */
  slaOverdue: boolean;
  /** Segment: only tickets where needs_agent_response = true */
  needsResponse: boolean;
  /** Segment: filter by sla_state — "at_risk" | "breached" | "" */
  slaState: string;
  /** Segment: only tickets where first_response_due_at has passed and no reply yet */
  firstResponseOverdue: boolean;
  /** Multi-status group — e.g. resolved + closed */
  statusGroup: string;
  categoryGroup?: string;
  channel?: string;
  tenantId?: string;
  /** Segment: AI assistant handling (handling_mode=assistant) */
  aiHandling?: boolean;
}

/** Build query string for GET /api/admin/support-tickets (matches Next list page). */
export function buildSupportTicketsSearchParams(f: SupportTicketsFilterState): string {
  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(f.pageIndex * PAGE_SIZE));
  if (f.statusGroup) params.set("status_group", f.statusGroup);
  else if (f.status !== "all") params.set("status", f.status);
  if (f.priority !== "all") params.set("priority", f.priority);
  if (f.category !== "all") params.set("category", f.category);
  if (f.assign === "unassigned") params.set("assigned_to", "unassigned");
  else if (f.assign === "mine" && f.staffUserId) params.set("assigned_to", f.staffUserId);
  const q = f.q.trim();
  if (q) params.set("q", q);
  if (f.sort && f.sort !== "smart") params.set("sort", f.sort);
  if (f.slaOverdue) params.set("sla_overdue", "1");
  if (f.needsResponse) params.set("needs_response", "1");
  if (f.slaState) params.set("sla_state", f.slaState);
  if (f.firstResponseOverdue) params.set("first_response_overdue", "1");
  if (f.categoryGroup) params.set("category_group", f.categoryGroup);
  if (f.channel && f.channel !== "all") params.set("channel", f.channel);
  if (f.tenantId) params.set("tenant_id", f.tenantId);
  if (f.aiHandling) params.set("handling_mode", "assistant");
  return params.toString();
}

export function supportTicketsPageSize(): number {
  return PAGE_SIZE;
}

/** Active queue statuses aligned with loadSupportTicketCounts open bucket. */
export const SUPPORT_TICKET_STATUS_GROUP_ACTIVE = "active";

/** Saved-view chip definitions for the support ticket queue. */
export type SavedView = AdminSavedView<SupportTicketsFilterState>;

export const SUPPORT_TICKET_SAVED_VIEWS: SavedView[] = [
  {
    id: "needs_response",
    label: "Needs response",
    params: {
      needsResponse: true,
      status: "all",
      sort: "smart",
      slaOverdue: false,
      slaState: "",
      firstResponseOverdue: false,
    },
  },
  {
    id: "ai_handling",
    label: "AI handling",
    params: {
      aiHandling: true,
      status: "all",
      sort: "updated_desc",
      slaOverdue: false,
      needsResponse: false,
      slaState: "",
      firstResponseOverdue: false,
      assign: "all",
    },
  },
  {
    id: "unassigned",
    label: "Unassigned",
    params: {
      assign: "unassigned",
      statusGroup: SUPPORT_TICKET_STATUS_GROUP_ACTIVE,
      status: "all",
      sort: "smart",
      slaOverdue: false,
      needsResponse: false,
      slaState: "",
      firstResponseOverdue: false,
    },
  },
  {
    id: "mine",
    label: "Assigned to me",
    params: {
      assign: "mine",
      status: "all",
      sort: "smart",
      slaOverdue: false,
      needsResponse: false,
      slaState: "",
      firstResponseOverdue: false,
    },
  },
  {
    id: "first_response_overdue",
    label: "First reply overdue",
    params: {
      firstResponseOverdue: true,
      status: "all",
      sort: "smart",
      slaOverdue: false,
      needsResponse: false,
      slaState: "",
      assign: "all",
    },
  },
  {
    id: "sla_at_risk",
    label: "Due within 6h",
    params: {
      slaState: "at_risk",
      status: "all",
      sort: "sla_asc",
      slaOverdue: false,
      needsResponse: false,
      firstResponseOverdue: false,
      assign: "all",
    },
  },
  {
    id: "channel_email",
    label: "Email",
    params: {
      channel: "email",
      status: "all",
      sort: "updated_desc",
      slaOverdue: false,
      needsResponse: false,
      slaState: "",
      firstResponseOverdue: false,
      assign: "all",
    },
  },
  {
    id: "breaching_sla",
    label: "Breaching SLA",
    params: {
      slaState: "breached",
      statusGroup: SUPPORT_TICKET_STATUS_GROUP_ACTIVE,
      status: "all",
      sort: "sla_asc",
      slaOverdue: false,
      needsResponse: false,
      firstResponseOverdue: false,
      assign: "all",
    },
  },
  {
    id: "waiting_customer",
    label: "Waiting on customer",
    params: {
      status: "waiting_customer",
      sort: "smart",
      slaOverdue: false,
      needsResponse: false,
      slaState: "",
      firstResponseOverdue: false,
      assign: "all",
    },
  },
  {
    id: "all_open",
    label: "Active queue",
    params: {
      statusGroup: SUPPORT_TICKET_STATUS_GROUP_ACTIVE,
      status: "all",
      sort: "smart",
      slaOverdue: false,
      needsResponse: false,
      slaState: "",
      firstResponseOverdue: false,
      assign: "all",
    },
  },
  {
    id: "resolved",
    label: "Resolved / Closed",
    params: {
      status: "all",
      statusGroup: "resolved_closed",
      sort: "updated_desc",
      slaOverdue: false,
      needsResponse: false,
      slaState: "",
      firstResponseOverdue: false,
    },
  },
];

const SUPPORT_TICKET_VIEW_DEFAULTS: Partial<SupportTicketsFilterState> = {
  status: "all",
  priority: "all",
  assign: "all",
  sort: "smart",
  slaOverdue: false,
  needsResponse: false,
  slaState: "",
  firstResponseOverdue: false,
  statusGroup: "",
  categoryGroup: "",
  channel: "all",
};

const supportTicketViewMatcher = createDefaultSavedViewMatcher<SupportTicketsFilterState>(
  SUPPORT_TICKET_VIEW_DEFAULTS,
);

/** Returns the saved-view id that matches the current filter state, or null. */
export function matchSupportTicketSavedView(f: SupportTicketsFilterState): string | null {
  return matchAdminSavedView(
    SUPPORT_TICKET_SAVED_VIEWS,
    f,
    [
      "status",
      "statusGroup",
      "priority",
      "assign",
      "sort",
      "slaOverdue",
      "needsResponse",
      "slaState",
      "firstResponseOverdue",
      "aiHandling",
      "channel",
      "categoryGroup",
    ],
    (current, paramValue, key) => {
      if (key === "aiHandling") {
        return Boolean(current.aiHandling) === Boolean(paramValue);
      }
      if (key === "statusGroup") {
        return (current.statusGroup || "") === (String(paramValue ?? "") || "");
      }
      if (key === "categoryGroup") {
        return (current.categoryGroup || "") === (String(paramValue ?? "") || "");
      }
      if (key === "channel") {
        const expected = String(paramValue ?? "all");
        return (current.channel || "all") === expected;
      }
      return supportTicketViewMatcher(current, paramValue, key);
    },
  );
}

/** Apply a saved-view preset to URL search params (shareable queue / bookmark hydration). */
export function mergeSupportTicketSavedViewIntoSearchParams(
  prev: URLSearchParams,
  viewId: string,
): URLSearchParams {
  const view = SUPPORT_TICKET_SAVED_VIEWS.find((v) => v.id === viewId);
  const n = new URLSearchParams(prev);
  n.set("saved_view", viewId);
  n.set("page", "1");
  n.delete("status");
  n.delete("priority");
  n.delete("category");
  n.delete("assign");
  n.delete("sort");
  n.delete("sla_overdue");
  n.delete("needs_response");
  n.delete("sla_state");
  n.delete("first_response_overdue");
  n.delete("handling_mode");
  n.delete("status_group");
  n.delete("category_group");
  n.delete("channel");
  if (view) {
    const p = view.params;
    if (p.statusGroup) n.set("status_group", p.statusGroup);
    else if (p.status && p.status !== "all") n.set("status", p.status);
    if (p.priority && p.priority !== "all") n.set("priority", p.priority);
    if (p.assign && p.assign !== "all") n.set("assign", p.assign);
    if (p.sort && p.sort !== "smart") n.set("sort", p.sort);
    if (p.slaOverdue) n.set("sla_overdue", "1");
    if (p.needsResponse) n.set("needs_response", "1");
    if (p.slaState) n.set("sla_state", p.slaState);
    if (p.firstResponseOverdue) n.set("first_response_overdue", "1");
    if (p.aiHandling) n.set("handling_mode", "assistant");
    if (p.channel && p.channel !== "all") n.set("channel", p.channel);
    if (p.categoryGroup) n.set("category_group", p.categoryGroup);
    if (p.category && p.category !== "all") n.set("category", p.category);
  }
  return n;
}
