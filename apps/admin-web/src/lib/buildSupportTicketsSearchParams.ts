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
  return params.toString();
}

export function supportTicketsPageSize(): number {
  return PAGE_SIZE;
}
