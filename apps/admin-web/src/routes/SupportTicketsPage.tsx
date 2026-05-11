import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_SUPPORT } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { useDebouncedUrlParam } from "@/hooks/useDebouncedUrlParam";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { labelForSupportTicketCategory, SUPPORT_TICKET_CATEGORY_GROUPS } from "@/lib/supportTicketCategories";
import { buildSupportTicketsSearchParams, supportTicketsPageSize } from "@/lib/buildSupportTicketsSearchParams";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";
import { AdminModal } from "@/components/admin/AdminModal";
import { Filter, LayoutGrid, LayoutList } from "lucide-react";

interface SupportTicket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: string | null;
  priority: string;
  status: string;
  tags?: string[] | null;
  requester_type?: "customer" | "provider" | "admin" | null;
  support_context_type?: string | null;
  support_context_label?: string | null;
  csat_score?: number | null;
  sla_resolution_due_at?: string | null;
  user: { id: string; email: string; full_name: string | null } | null;
  provider: { id: string; business_name: string } | null;
  assigned_user: { id: string; email: string; full_name: string | null } | null;
  has_unread_staff_reply?: boolean;
  last_message_from?: "customer" | "staff" | null;
  last_message_at?: string | null;
  created_at: string;
  updated_at: string;
}

function isSlaBreached(ticket: SupportTicket): boolean {
  if (!ticket.sla_resolution_due_at) return false;
  if (ticket.status === "resolved" || ticket.status === "closed") return false;
  return new Date(ticket.sla_resolution_due_at).getTime() < Date.now();
}

function priorityPillClass(p: string): string {
  if (p === "urgent") return "bg-red-100 text-red-900";
  if (p === "high") return "bg-orange-100 text-orange-900";
  if (p === "low") return "bg-slate-100 text-slate-800";
  return "bg-gray-100 text-gray-900";
}

function ticketAgeDays(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

const SUPPORT_CONTEXT_OPTIONS = [
  { value: "booking", label: "Booking" },
  { value: "product_order", label: "Product / ecommerce order" },
  { value: "gift_card", label: "Gift card" },
  { value: "payment", label: "Payment / refund" },
  { value: "provider_onboarding", label: "Provider onboarding" },
  { value: "account", label: "Account" },
  { value: "technical", label: "Technical" },
  { value: "other", label: "Other" },
] as const;

export function SupportTicketsPage() {
  useAdminDocumentTitle("Support Tickets");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_SUPPORT,
    "Support section access is required for support tickets."
  );
  const { bootstrap } = useAdminSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newCategory, setNewCategory] = useState("");
  const [newRequesterType, setNewRequesterType] = useState("admin");
  const [newContextType, setNewContextType] = useState<(typeof SUPPORT_CONTEXT_OPTIONS)[number]["value"]>("booking");
  const [newContextLabel, setNewContextLabel] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const createMut = useMutation({
    mutationFn: () =>
      adminApi.postJson("/api/admin/support-tickets", {
        subject: newSubject.trim(),
        description: newDescription.trim(),
        priority: newPriority,
        category: newCategory || null,
        requester_type: newRequesterType,
        support_context_type: newContextType,
        support_context_label: newContextLabel.trim() || null,
      }),
    onSuccess: () => {
      adminToast.success("Support ticket created");
      setShowCreate(false);
      setNewSubject("");
      setNewDescription("");
      setNewPriority("medium");
      setNewCategory("");
      setNewRequesterType("admin");
      setNewContextType("booking");
      setNewContextLabel("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.supportTickets.all() });
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to create ticket"),
  });

  const statusFilter = searchParams.get("status") ?? "all";
  const priorityFilter = searchParams.get("priority") ?? "all";
  const categoryFilter = searchParams.get("category") ?? "all";
  const assignFilter = searchParams.get("assign") ?? "all";
  const sortFilter = searchParams.get("sort") ?? "updated_desc";
  const slaOverdueFilter = searchParams.get("sla_overdue") === "1";
  const viewFilter = searchParams.get("view");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageIndex = page - 1;
  const qFromUrl = searchParams.get("q") ?? "";

  const [qDraft, setQDraft] = useDebouncedUrlParam(qFromUrl, setSearchParams, { param: "q", delayMs: 400 });

  const setFilter = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          const defaults: Record<string, string> = {
            status: "all",
            priority: "all",
            category: "all",
            assign: "all",
            sort: "updated_desc",
            sla_overdue: "all",
          };
          if (value === defaults[key]) n.delete(key);
          else n.set(key, value);
          n.set("page", "1");
          return n;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const queryString = useMemo(
    () =>
      buildSupportTicketsSearchParams({
        pageIndex,
        status: statusFilter,
        priority: priorityFilter,
        category: categoryFilter,
        assign: assignFilter,
        q: qFromUrl,
        staffUserId: bootstrap?.userId,
        sort: sortFilter,
        slaOverdue: slaOverdueFilter,
      }),
    [
      pageIndex,
      statusFilter,
      priorityFilter,
      categoryFilter,
      assignFilter,
      qFromUrl,
      bootstrap?.userId,
      sortFilter,
      slaOverdueFilter,
    ]
  );

  const q = useQuery({
    queryKey: adminQueryKeys.supportTickets.list(queryString),
    queryFn: () =>
      adminApi.getJson<{ tickets: SupportTicket[]; total: number }>(`/api/admin/support-tickets?${queryString}`, {
        timeoutMs: 45_000,
      }),
    enabled: allowed,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const tickets = q.data?.tickets ?? [];
  const total = q.data?.total ?? 0;
  const pageSize = supportTicketsPageSize();
  const offset = pageIndex * pageSize;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = offset + tickets.length;

  const setPage = (next: number) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("page", String(Math.max(1, next)));
        return n;
      },
      { replace: true }
    );
  };

  const setView = (next: "cards" | "table") => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("view", next);
        return n;
      },
      { replace: true }
    );
  };

  if (denied) return denied;

  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Support tickets" description="Search, filter, and paginate tickets" />
        <AdminPanel>
          <AdminPageSkeleton rows={8} />
        </AdminPanel>
      </div>
    );
  }

  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Support tickets" />
        <AdminPanel>
          <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
        </AdminPanel>
      </div>
    );
  }

  const hasFilters =
    qFromUrl ||
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    categoryFilter !== "all" ||
    assignFilter !== "all" ||
    sortFilter !== "updated_desc" ||
    slaOverdueFilter;

  return (
    <div className="space-y-6 px-2 sm:px-0">
      <AdminPageHeader
        title="Support tickets"
        description="Filters sync to the URL; the queue refreshes when you return to this tab and about every minute while it stays open."
        actions={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            + New ticket
          </button>
        }
      />

      <AdminModal open={showCreate} title="Create support ticket" onClose={() => setShowCreate(false)} footer={null}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Subject *</label>
            <input type="text" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Describe the issue briefly" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
            <textarea rows={4} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Full issue details…" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Requester type</label>
              <select value={newRequesterType} onChange={(e) => setNewRequesterType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none">
                <option value="admin">Admin-created</option>
                <option value="customer">Customer</option>
                <option value="provider">Provider</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Related area</label>
              <select value={newContextType} onChange={(e) => setNewContextType(e.target.value as typeof newContextType)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none">
                {SUPPORT_CONTEXT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Related reference</label>
            <input type="text" value={newContextLabel} onChange={(e) => setNewContextLabel(e.target.value)} placeholder="Booking/order/payment reference, product name, or note" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
              <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. billing, booking" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
            <button type="button" disabled={createMut.isPending || !newSubject.trim() || !newDescription.trim()} onClick={() => createMut.mutate()} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
              {createMut.isPending ? "Creating…" : "Create ticket"}
            </button>
          </div>
        </div>
      </AdminModal>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm md:hidden"
        >
          <Filter className="h-4 w-4" />
          {filtersOpen ? "Hide filters" : "Filter and sort"}
        </button>
        <div className="ml-auto inline-flex rounded-xl border border-gray-300 bg-white">
          <button
            type="button"
            onClick={() => setView("cards")}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-l-xl px-3 ${
              viewFilter === "cards" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
            aria-label="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-r-xl px-3 ${
              viewFilter === "table" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
            aria-label="Table view"
          >
            <LayoutList className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AdminPanel className={`${filtersOpen ? "block" : "hidden"} md:block`}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <input
              type="search"
              placeholder="Search subject, ticket #, or description…"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              className="min-h-11 w-full flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base sm:text-sm"
            />
            <select
              value={statusFilter}
              onChange={(e) => setFilter("status", e.target.value)}
              className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-base sm:text-sm lg:w-44"
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="waiting_customer">Waiting on customer</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setFilter("priority", e.target.value)}
              className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-base sm:text-sm lg:w-44"
            >
              <option value="all">All priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={categoryFilter}
              onChange={(e) => setFilter("category", e.target.value)}
              className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base sm:max-w-md sm:text-sm"
            >
              <option value="all">All categories</option>
              {SUPPORT_TICKET_CATEGORY_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={assignFilter}
              onChange={(e) => setFilter("assign", e.target.value)}
              className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-base sm:w-52 sm:text-sm"
            >
              <option value="all">All tickets</option>
              <option value="unassigned">Unassigned</option>
              <option value="mine" disabled={!bootstrap?.userId}>
                Assigned to me
              </option>
            </select>
            <select
              value={sortFilter}
              onChange={(e) => setFilter("sort", e.target.value)}
              className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-base sm:w-56 sm:text-sm"
            >
              <option value="updated_desc">Sort: Last updated</option>
              <option value="created_desc">Sort: Newest</option>
              <option value="sla_asc">Sort: SLA due (soonest)</option>
              <option value="priority_asc">Sort: Priority</option>
            </select>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={slaOverdueFilter}
                onChange={(e) => setFilter("sla_overdue", e.target.checked ? "1" : "all")}
              />
              SLA overdue
            </label>
          </div>
        </div>
      </AdminPanel>

      {tickets.length === 0 ? (
        <EmptyState
          title="No support tickets"
          description={hasFilters ? "No tickets match your filters." : "No support tickets yet."}
        />
      ) : (
        <>
          <div
            className={
              viewFilter === "table"
                ? "hidden"
                : viewFilter === "cards"
                  ? "grid gap-3"
                  : "grid gap-3 md:hidden"
            }
          >
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                to={adminSpaTo(`/admin/support-tickets/${encodeURIComponent(ticket.id)}`)}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm ring-1 ring-gray-950/[0.03] transition-colors hover:border-gray-300 hover:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-medium text-gray-500">{ticket.ticket_number}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-700">
                      {ticket.requester_type || (ticket.provider ? "provider" : "customer")}
                    </span>
                      {ticket.has_unread_staff_reply || ticket.last_message_from === "staff" ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                          Support replied
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 font-semibold text-gray-900">{ticket.subject}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {ticket.category ? labelForSupportTicketCategory(ticket.category) : "Uncategorized"}
                    </p>
                    {ticket.support_context_type ? (
                      <p className="mt-1 text-xs text-gray-600">
                        About {ticket.support_context_type.replace(/_/g, " ")}
                        {ticket.support_context_label ? ` · ${ticket.support_context_label}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs capitalize ${priorityPillClass(ticket.priority)}`}>
                    {ticket.priority}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-gray-700">
                  <div>
                    <span className="text-xs text-gray-500">Customer </span>
                    {ticket.user ? ticket.user.full_name || ticket.user.email : ticket.provider?.business_name || "—"}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize">
                      {ticket.status.replace(/_/g, " ")}
                    </span>
                    {ticket.sla_resolution_due_at ? (
                      <span className={isSlaBreached(ticket) ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800" : "rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"}>
                        {isSlaBreached(ticket) ? "SLA overdue" : "SLA due"}{" "}
                        {new Date(ticket.sla_resolution_due_at).toLocaleDateString()}
                      </span>
                    ) : null}
                    {typeof ticket.csat_score === "number" ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        CSAT {ticket.csat_score}/5
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                    <span>{ticket.assigned_user ? ticket.assigned_user.full_name || ticket.assigned_user.email : "Unassigned"}</span>
                    <span>Updated {new Date(ticket.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <AdminDataTable className={viewFilter === "cards" ? "hidden" : viewFilter === "table" ? "" : "hidden md:block"}>
            <AdminTableHead>
              <tr>
                <AdminTh>Ticket #</AdminTh>
                <AdminTh>Subject</AdminTh>
                <AdminTh>User</AdminTh>
                <AdminTh>Origin</AdminTh>
                <AdminTh>Context</AdminTh>
                <AdminTh>Priority</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>SLA</AdminTh>
                <AdminTh>Tags</AdminTh>
                <AdminTh>Assigned</AdminTh>
                <AdminTh>Age</AdminTh>
                <AdminTh>Created</AdminTh>
                <AdminTh className="text-right">Actions</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <AdminTd className="font-mono text-xs">{ticket.ticket_number}</AdminTd>
                  <AdminTd>
                    <div className="max-w-xs">
                      <p className="truncate font-medium">{ticket.subject}</p>
                      {ticket.category ? (
                        <p className="text-xs text-gray-500">{labelForSupportTicketCategory(ticket.category)}</p>
                      ) : null}
                    </div>
                  </AdminTd>
                  <AdminTd>
                    {ticket.user ? (
                      <>
                        <p className="text-sm font-medium">{ticket.user.full_name || "—"}</p>
                        <p className="text-xs text-gray-500">{ticket.user.email}</p>
                      </>
                    ) : ticket.provider ? (
                      <p className="text-sm">{ticket.provider.business_name}</p>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </AdminTd>
                  <AdminTd>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize">
                      {ticket.requester_type || (ticket.provider ? "provider" : "customer")}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    {ticket.support_context_type ? (
                      <div className="max-w-[12rem] text-xs">
                        <p className="font-medium capitalize text-gray-800">{ticket.support_context_type.replace(/_/g, " ")}</p>
                        {ticket.support_context_label ? <p className="truncate text-gray-500">{ticket.support_context_label}</p> : null}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </AdminTd>
                  <AdminTd>
                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${priorityPillClass(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{ticket.status.replace(/_/g, " ")}</span>
                  </AdminTd>
                  <AdminTd className="whitespace-nowrap text-sm">
                    {ticket.sla_resolution_due_at ? (
                      <div className="flex flex-col gap-0.5">
                        <span className={isSlaBreached(ticket) ? "font-medium text-red-700" : "text-gray-700"}>
                          {isSlaBreached(ticket) ? "Overdue" : "Due"}{" "}
                          {new Date(ticket.sla_resolution_due_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </AdminTd>
                  <AdminTd>
                    {ticket.tags && ticket.tags.length > 0 ? (
                      <span className="line-clamp-2 text-xs text-gray-600">{ticket.tags.join(", ")}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </AdminTd>
                  <AdminTd>
                    {ticket.assigned_user ? (
                      <span className="text-sm">{ticket.assigned_user.full_name || ticket.assigned_user.email}</span>
                    ) : (
                      <span className="text-gray-400">Unassigned</span>
                    )}
                  </AdminTd>
                  <AdminTd className="whitespace-nowrap text-gray-500">{ticketAgeDays(ticket.created_at)}d</AdminTd>
                  <AdminTd>
                    <div className="text-sm">{new Date(ticket.created_at).toLocaleDateString()}</div>
                    <div className="text-xs text-gray-500">{new Date(ticket.created_at).toLocaleTimeString()}</div>
                  </AdminTd>
                  <AdminTd className="text-right">
                    <Link
                      className="text-sm font-medium text-gray-900 underline"
                      to={adminSpaTo(`/admin/support-tickets/${encodeURIComponent(ticket.id)}`)}
                    >
                      Open
                    </Link>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>

          <div className="flex flex-col items-center justify-between gap-3 text-sm text-gray-600 sm:flex-row">
            <p>
              Showing {rangeStart}–{rangeEnd} of {total}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 disabled:opacity-40"
                disabled={offset + tickets.length >= total}
                onClick={() => setPage(page + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
