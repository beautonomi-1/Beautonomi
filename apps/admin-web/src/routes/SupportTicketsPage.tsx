import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_SUPPORT } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { getSupabaseBrowserClient } from "@/lib/supabase";
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
import {
  buildSupportTicketsSearchParams,
  supportTicketsPageSize,
  SUPPORT_TICKET_SAVED_VIEWS,
} from "@/lib/buildSupportTicketsSearchParams";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { Filter, LayoutGrid, LayoutList } from "lucide-react";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { SupportTicketDetailView } from "@/routes/support/SupportTicketDetailView";
import { cn } from "@/lib/cn";

type AttentionState =
  | "awaiting_agent"
  | "unassigned_new"
  | "first_response_overdue"
  | "sla_breached"
  | "sla_at_risk"
  | "waiting_customer"
  | "assigned_idle"
  | "resolved";

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
  first_response_due_at?: string | null;
  user: { id: string; email: string; full_name: string | null } | null;
  provider: { id: string; business_name: string } | null;
  assigned_user: { id: string; email: string; full_name: string | null } | null;
  has_unread_staff_reply?: boolean;
  last_message_from?: "customer" | "staff" | null;
  last_message_at?: string | null;
  // Computed by server (migration 726 + attention helper)
  needs_agent_response?: boolean | null;
  attention_state?: AttentionState | null;
  sla_state?: "none" | "ok" | "at_risk" | "breached" | null;
  agent_unread?: boolean | null;
  created_at: string;
  updated_at: string;
}

function assigneeInitials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/** Returns badge JSX for the attention state returned by the server. */
function AttentionBadge({ ticket }: { ticket: SupportTicket }) {
  const state = ticket.attention_state;
  if (!state || state === "assigned_idle" || state === "resolved") return null;

  if (state === "first_response_overdue") {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
        First reply overdue
      </span>
    );
  }
  if (state === "sla_breached") {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
        SLA overdue
      </span>
    );
  }
  if (state === "awaiting_agent") {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
        Awaiting reply
      </span>
    );
  }
  if (state === "unassigned_new") {
    return (
      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
        Unassigned
      </span>
    );
  }
  if (state === "sla_at_risk") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
        Due soon
      </span>
    );
  }
  if (state === "waiting_customer") {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
        Waiting on customer
      </span>
    );
  }
  return null;
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

function SupportTicketCard({
  ticket,
  isSelected,
  isDesktopInbox,
  onSelectDesktop,
}: {
  ticket: SupportTicket;
  isSelected: boolean;
  isDesktopInbox: boolean;
  onSelectDesktop: () => void;
}) {
  return (
    <Link
      to={adminSpaTo(`/admin/support-tickets/${encodeURIComponent(ticket.id)}`)}
      onClick={(e) => {
        if (isDesktopInbox) {
          e.preventDefault();
          onSelectDesktop();
        }
      }}
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "block rounded-2xl border bg-white p-4 shadow-sm transition-all",
        isSelected
          ? "border-gray-900 bg-gray-50 ring-2 ring-gray-900/15"
          : "border-gray-200 ring-1 ring-gray-950/[0.03] hover:border-gray-300 hover:bg-gray-50",
        ticket.agent_unread && "border-l-4 border-l-red-400",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {ticket.agent_unread ? (
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="Unread" />
            ) : null}
            <span className="font-mono text-xs font-medium text-gray-500">{ticket.ticket_number}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-700">
              {ticket.requester_type || (ticket.provider ? "provider" : "customer")}
            </span>
            <AttentionBadge ticket={ticket} />
          </div>
          <p className={cn("mt-1 line-clamp-2 text-gray-900", ticket.agent_unread ? "font-bold" : "font-semibold")}>{ticket.subject}</p>
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
            <span
              className={
                isSlaBreached(ticket)
                  ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
                  : "rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
              }
            >
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
  );
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
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const inboxRef = useRef<HTMLDivElement>(null);
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");

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

  // Realtime: invalidate the support tickets list when any ticket is created or updated.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!allowed) return;
    const sb = getSupabaseBrowserClient();
    if (!sb) return;
    const scheduleInvalidate = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void qc.invalidateQueries({ queryKey: adminQueryKeys.supportTickets.all() });
      }, 600);
    };
    const channel = sb
      .channel("admin-support-tickets-list")
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "support_tickets" }, scheduleInvalidate)
      .subscribe();
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      try {
        sb.removeChannel(channel);
      } catch {
        // Ignore
      }
    };
  }, [allowed, qc]);

  const statusFilter = searchParams.get("status") ?? "all";
  const priorityFilter = searchParams.get("priority") ?? "all";
  const categoryFilter = searchParams.get("category") ?? "all";
  const assignFilter = searchParams.get("assign") ?? "all";
  const sortFilter = searchParams.get("sort") ?? "smart";
  const slaOverdueFilter = searchParams.get("sla_overdue") === "1";
  const needsResponseFilter = searchParams.get("needs_response") === "1";
  const slaStateFilter = searchParams.get("sla_state") ?? "";
  const firstResponseOverdueFilter = searchParams.get("first_response_overdue") === "1";
  const viewFilter = searchParams.get("view");
  const selectedId = searchParams.get("selected");
  const savedViewId = searchParams.get("saved_view") ?? "needs_response";
  const isTableView = viewFilter === "table";
  const isCardsView = !isTableView;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageIndex = page - 1;
  const qFromUrl = searchParams.get("q") ?? "";

  const [qDraft, setQDraft] = useDebouncedUrlParam(qFromUrl, setSearchParams, { param: "q", delayMs: 400 });

  const attentionFilter =
    needsResponseFilter
      ? "needs_response"
      : firstResponseOverdueFilter
        ? "first_response_overdue"
        : slaStateFilter === "at_risk"
          ? "sla_at_risk"
          : slaStateFilter === "breached" || slaOverdueFilter
            ? "sla_breached"
            : "";

  const setAttentionFilter = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete("needs_response");
          n.delete("first_response_overdue");
          n.delete("sla_state");
          n.delete("sla_overdue");
          if (value === "needs_response") n.set("needs_response", "1");
          else if (value === "first_response_overdue") n.set("first_response_overdue", "1");
          else if (value === "sla_at_risk") n.set("sla_state", "at_risk");
          else if (value === "sla_breached") n.set("sla_state", "breached");
          n.set("page", "1");
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

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
            sort: "smart",
            sla_overdue: "all",
            needs_response: "0",
            sla_state: "",
            first_response_overdue: "0",
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
      `${buildSupportTicketsSearchParams({
        pageIndex,
        status: statusFilter,
        priority: priorityFilter,
        category: categoryFilter,
        assign: assignFilter,
        q: qFromUrl,
        staffUserId: bootstrap?.userId,
        sort: sortFilter,
        slaOverdue: slaOverdueFilter,
        needsResponse: needsResponseFilter,
        slaState: slaStateFilter,
        firstResponseOverdue: firstResponseOverdueFilter,
      })}&include_counts=1`,
    [
      pageIndex,
      statusFilter,
      priorityFilter,
      categoryFilter,
      assignFilter,
      qFromUrl,
      bootstrap?.userId,
      sortFilter,
      needsResponseFilter,
      slaStateFilter,
      firstResponseOverdueFilter,
      slaOverdueFilter,
    ]
  );

  const q = useQuery({
    queryKey: adminQueryKeys.supportTickets.list(queryString),
    queryFn: () =>
      adminApi.getJson<{
        tickets: SupportTicket[];
        total: number;
        counts?: {
          open: number;
          unassigned: number;
          breaching_sla: number;
          awaiting_reply: number;
        };
      }>(`/api/admin/support-tickets?${queryString}`, {
        timeoutMs: 45_000,
      }),
    enabled: allowed,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const { data: assignees } = useQuery({
    queryKey: adminQueryKeys.supportTicketAssignees(),
    queryFn: () =>
      adminApi.getJson<{ assignees: Array<{ id: string; full_name: string | null; email: string | null }> }>(
        "/api/admin/support-ticket-assignees",
      ),
    enabled: allowed && isTableView,
  });

  const bulkMut = useMutation({
    mutationFn: (body: { ticket_ids: string[]; assigned_to?: string | null; status?: string }) =>
      adminApi.postJson("/api/admin/support-tickets/bulk", body),
    onSuccess: () => {
      adminToast.success("Tickets updated");
      setSelectedIds([]);
      setBulkAssignee("");
      setBulkStatus("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.supportTickets.all() });
    },
    onError: (err: Error) => adminToast.error(err.message || "Bulk update failed"),
  });

  const tickets = q.data?.tickets ?? [];
  const counts = q.data?.counts;
  const total = q.data?.total ?? 0;
  const pageSize = supportTicketsPageSize();
  const offset = pageIndex * pageSize;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = offset + tickets.length;

  const setSelectedTicket = useCallback(
    (ticketId: string) => {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set("selected", ticketId);
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!isDesktop || isTableView || tickets.length === 0) return;
    const valid = selectedId && tickets.some((t) => t.id === selectedId);
    if (!valid) {
      setSelectedTicket(tickets[0].id);
    }
  }, [isDesktop, isTableView, tickets, selectedId, setSelectedTicket]);

  const handleInboxKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isDesktop || isTableView || tickets.length === 0) return;
      const currentId = selectedId ?? tickets[0]?.id;
      const idx = tickets.findIndex((t) => t.id === currentId);
      if (idx < 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = tickets[Math.min(idx + 1, tickets.length - 1)];
        if (next) setSelectedTicket(next.id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = tickets[Math.max(idx - 1, 0)];
        if (prev) setSelectedTicket(prev.id);
      } else if (e.key === "Enter" && currentId) {
        e.preventDefault();
        navigate(adminSpaTo(`/admin/support-tickets/${encodeURIComponent(currentId)}`));
      }
    },
    [isDesktop, isTableView, tickets, selectedId, setSelectedTicket, navigate],
  );

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

  const applySavedView = useCallback(
    (viewId: string) => {
      const view = SUPPORT_TICKET_SAVED_VIEWS.find((v) => v.id === viewId);
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set("saved_view", viewId);
          n.set("page", "1");
          // Reset all filter-relevant params first
          n.delete("status");
          n.delete("priority");
          n.delete("category");
          n.delete("assign");
          n.delete("sort");
          n.delete("sla_overdue");
          n.delete("needs_response");
          n.delete("sla_state");
          n.delete("first_response_overdue");
          if (view) {
            const p = view.params;
            if (p.status && p.status !== "all") n.set("status", p.status);
            if (p.priority && p.priority !== "all") n.set("priority", p.priority);
            if (p.assign && p.assign !== "all") n.set("assign", p.assign);
            if (p.sort && p.sort !== "smart") n.set("sort", p.sort);
            if (p.slaOverdue) n.set("sla_overdue", "1");
            if (p.needsResponse) n.set("needs_response", "1");
            if (p.slaState) n.set("sla_state", p.slaState);
            if (p.firstResponseOverdue) n.set("first_response_overdue", "1");
          }
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

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
    sortFilter !== "smart" ||
    slaOverdueFilter ||
    needsResponseFilter ||
    !!slaStateFilter ||
    firstResponseOverdueFilter;

  return (
    <div className="space-y-6 px-2 sm:px-0">
      <AdminPageHeader
        title="Support tickets"
        description={
          isDesktop && isCardsView
            ? "Select a ticket to read and reply in the panel. Use ↑↓ to move between tickets and Enter to open full page. Filters sync to the URL."
            : "Filters sync to the URL; the queue refreshes when you return to this tab and about every minute while it stays open."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={adminSpaTo("/admin/reports/support-performance")}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Performance report
            </Link>
            <Link
              to={adminSpaTo("/admin/reports/support-workload")}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Workload report
            </Link>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              + New ticket
            </button>
          </div>
        }
      />

      {counts ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AdminMetricCard label="Open tickets" value={counts.open.toLocaleString()} variant="slate" />
          <AdminMetricCard label="Unassigned" value={counts.unassigned.toLocaleString()} variant="amber" />
          <AdminMetricCard label="Breaching SLA" value={counts.breaching_sla.toLocaleString()} variant="rose" />
          <AdminMetricCard label="Awaiting reply" value={counts.awaiting_reply.toLocaleString()} variant="violet" />
        </div>
      ) : null}

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
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              >
                <option value="">Uncategorized</option>
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

      {/* Saved-view chips */}
      <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
        {SUPPORT_TICKET_SAVED_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => applySavedView(view.id)}
            className={cn(
              "inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              savedViewId === view.id
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300",
            )}
          >
            {view.label}
          </button>
        ))}
      </div>

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
              isCardsView ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
            aria-label="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-r-xl px-3 ${
              isTableView ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
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
              <option value="smart">Sort: Smart (attention first)</option>
              <option value="updated_desc">Sort: Last updated</option>
              <option value="created_desc">Sort: Newest</option>
              <option value="sla_asc">Sort: SLA due (soonest)</option>
              <option value="priority_asc">Sort: Priority</option>
            </select>
            <select
              value={attentionFilter}
              onChange={(e) => setAttentionFilter(e.target.value)}
              className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-base sm:w-56 sm:text-sm"
            >
              <option value="">All attention states</option>
              <option value="needs_response">Needs response</option>
              <option value="first_response_overdue">First reply overdue</option>
              <option value="sla_at_risk">SLA at risk</option>
              <option value="sla_breached">SLA breached</option>
            </select>
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
          {isCardsView && isDesktop ? (
            <div
              ref={inboxRef}
              tabIndex={0}
              onKeyDown={handleInboxKeyDown}
              className="grid grid-cols-1 gap-4 outline-none lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start"
              aria-label="Support ticket inbox"
            >
              <div className="max-h-[calc(100dvh-14rem)] space-y-3 overflow-y-auto pr-1">
                {tickets.map((ticket) => (
                  <SupportTicketCard
                    key={ticket.id}
                    ticket={ticket}
                    isSelected={selectedId === ticket.id}
                    isDesktopInbox
                    onSelectDesktop={() => setSelectedTicket(ticket.id)}
                  />
                ))}
              </div>
              <div className="sticky top-4 max-h-[calc(100dvh-14rem)] min-h-[24rem] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-sm ring-1 ring-gray-950/[0.03]">
                {selectedId && tickets.some((t) => t.id === selectedId) ? (
                  <SupportTicketDetailView id={selectedId} variant="panel" />
                ) : (
                  <EmptyState
                    title="Select a ticket"
                    description="Choose a ticket from the list to read and reply without leaving the queue."
                  />
                )}
              </div>
            </div>
          ) : null}

          {isCardsView && !isDesktop ? (
            <div className="grid gap-3">
              {tickets.map((ticket) => (
                <SupportTicketCard
                  key={ticket.id}
                  ticket={ticket}
                  isSelected={false}
                  isDesktopInbox={false}
                  onSelectDesktop={() => {}}
                />
              ))}
            </div>
          ) : null}

          <AdminDataTable className={isTableView ? "" : "hidden"}>
            {selectedIds.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
                <span className="text-sm text-gray-600">{selectedIds.length} selected</span>
                <select
                  value={bulkAssignee}
                  onChange={(e) => setBulkAssignee(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Bulk assign…</option>
                  {(assignees?.assignees ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name || a.email}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!bulkAssignee || bulkMut.isPending}
                  onClick={() =>
                    bulkMut.mutate({ ticket_ids: selectedIds, assigned_to: bulkAssignee })
                  }
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Assign
                </button>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Bulk status…</option>
                  <option value="in_progress">In progress</option>
                  <option value="waiting_customer">Waiting on customer</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                <button
                  type="button"
                  disabled={!bulkStatus || bulkMut.isPending}
                  onClick={() =>
                    bulkMut.mutate({ ticket_ids: selectedIds, status: bulkStatus })
                  }
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Update status
                </button>
              </div>
            ) : null}
            <AdminTableHead>
              <tr>
                <AdminTh>
                  <input
                    type="checkbox"
                    checked={tickets.length > 0 && selectedIds.length === tickets.length}
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? tickets.map((t) => t.id) : [])
                    }
                    aria-label="Select all tickets on page"
                  />
                </AdminTh>
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
                  <AdminTd>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(ticket.id)}
                      onChange={(e) =>
                        setSelectedIds((prev) =>
                          e.target.checked
                            ? [...prev, ticket.id]
                            : prev.filter((id) => id !== ticket.id),
                        )
                      }
                      aria-label={`Select ${ticket.ticket_number}`}
                    />
                  </AdminTd>
                  <AdminTd className="font-mono text-xs">{ticket.ticket_number}</AdminTd>
                  <AdminTd>
                    <div className="max-w-xs">
                      <div className="flex items-center gap-1.5">
                        {ticket.agent_unread ? (
                          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="Unread" />
                        ) : null}
                        <p className={cn("truncate", ticket.agent_unread ? "font-bold" : "font-medium")}>{ticket.subject}</p>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {ticket.category ? (
                          <span className="text-xs text-gray-500">{labelForSupportTicketCategory(ticket.category)}</span>
                        ) : null}
                        <AttentionBadge ticket={ticket} />
                      </div>
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
                      <span className="inline-flex items-center gap-2 text-sm">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700">
                          {assigneeInitials(ticket.assigned_user.full_name, ticket.assigned_user.email)}
                        </span>
                        {ticket.assigned_user.full_name || ticket.assigned_user.email}
                      </span>
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
