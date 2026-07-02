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
}

/** Build query string for GET /api/admin/support-tickets (matches Next list page). */
export function buildSupportTicketsSearchParams(f: SupportTicketsFilterState): string {
  const params = new URLSearchParams();
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(f.pageIndex * PAGE_SIZE));
  if (f.status !== "all") params.set("status", f.status);
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
  return params.toString();
}

export function supportTicketsPageSize(): number {
  return PAGE_SIZE;
}

/**
 * Saved-view chip definitions.  Each view is a preset URL-param combination
 * surfaced as a clickable chip above the queue.
 */
export interface SavedView {
  id: string;
  label: string;
  params: Partial<SupportTicketsFilterState>;
}

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
    id: "unassigned",
    label: "Unassigned",
    params: {
      assign: "unassigned",
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
    id: "breaching_sla",
    label: "Breaching SLA",
    params: {
      slaState: "at_risk",
      status: "all",
      sort: "sla_asc",
      slaOverdue: false,
      needsResponse: false,
      firstResponseOverdue: false,
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
    },
  },
  {
    id: "all_open",
    label: "All open",
    params: {
      status: "open",
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
      status: "resolved",
      sort: "updated_desc",
      slaOverdue: false,
      needsResponse: false,
      slaState: "",
      firstResponseOverdue: false,
    },
  },
];
