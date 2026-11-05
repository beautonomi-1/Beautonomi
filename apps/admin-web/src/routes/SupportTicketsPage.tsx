import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_SUPPORT } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { invalidateAdminShellCounts } from "@/lib/invalidateAdminShellCounts";
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
import {
  contextTypeForCategory,
  groupLabelForSupportTicketCategory,
  labelForSupportTicketCategory,
  SUPPORT_CONTEXT_TYPE_OPTIONS,
  SUPPORT_TICKET_CATEGORY_GROUPS,
  SUPPORT_TICKET_CATEGORY_GROUPS_RICH,
  supportTicketPresetFromCategory,
  type SupportContextType,
} from "@/lib/supportTicketCategories";
import {
  buildSupportTicketsSearchParams,
  listSupportTicketActiveFilters,
  matchSupportTicketSavedView,
  mergeSupportTicketSavedViewIntoSearchParams,
  supportTicketQueueQuery,
  supportTicketsPageSize,
  SUPPORT_TICKET_SAVED_VIEWS,
  SUPPORT_TICKET_STATUS_GROUP_ACTIVE,
  type SupportTicketsFilterState,
} from "@/lib/buildSupportTicketsSearchParams";
import { hasSupportTicketComposerDraft } from "@/lib/supportTicketComposerDrafts";
import { saveSupportTicketsQueueUiSearch } from "@/lib/supportTicketQueueSession";
import { resolveSupportTicketSelectedNavAction } from "@/lib/supportTicketViewportNavigation";
import { useAdminWorkspaceHeight } from "@/hooks/useAdminWorkspaceHeight";
import { AdminSavedViewChips } from "@/components/admin/AdminSavedViewChips";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminSupportContextHref } from "@/lib/adminSupportContextHref";
import { adminToast } from "@/lib/adminToast";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { Filter, LayoutGrid, LayoutList } from "lucide-react";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { SupportTicketDetailView } from "@/routes/support/SupportTicketDetailView";
import { priorityPillClass, relativeTime, statusPillClass } from "@/routes/support/ticket-detail/ticketDetailHelpers";
import { cn } from "@/lib/cn";
import { AdminVirtualList } from "@/components/admin/AdminVirtualList";

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
  support_context_id?: string | null;
  support_context_label?: string | null;
  csat_score?: number | null;
  sla_resolution_due_at?: string | null;
  first_response_due_at?: string | null;
  user: { id: string; email: string; full_name: string | null } | null;
  provider: { id: string; business_name: string } | null;
  assigned_user: { id: string; email: string; full_name: string | null } | null;
  has_unread_staff_reply?: boolean;
  last_message_from?: "customer" | "staff" | "assistant" | null;
  handling_mode?: "assistant" | "human" | string | null;
  last_message_at?: string | null;
  // Computed by server (migration 726 + attention helper)
  needs_agent_response?: boolean | null;
  attention_state?: AttentionState | null;
  sla_state?: "none" | "ok" | "at_risk" | "breached" | null;
  agent_unread?: boolean | null;
  channel?: "app" | "email" | null;
  tenant_id?: string | null;
  tenant?: { name?: string; slug?: string; region_code?: string | null } | null;
  requester_email?: string | null;
  latest_public_email_delivery_status?: string | null;
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
function SupportTicketListChips({ ticket }: { ticket: SupportTicket }) {
  const handling = ticket.handling_mode === "assistant";
  const lastFrom = ticket.last_message_from;
  return (
    <>
      {handling ? (
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-900">
          AI handling
        </span>
      ) : null}
      {lastFrom === "assistant" ? (
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800">
          AI replied
        </span>
      ) : lastFrom === "staff" ? (
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800">
          Support replied
        </span>
      ) : null}
    </>
  );
}

function AttentionBadge({ ticket }: { ticket: SupportTicket }) {
  const state = ticket.attention_state;
  if (!state || state === "assigned_idle" || state === "resolved") return null;

  if (state === "first_response_overdue") {
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
        First reply overdue
      </span>
    );
  }
  if (state === "sla_breached") {
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
        SLA overdue
      </span>
    );
  }
  if (state === "awaiting_agent") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
        Awaiting reply
      </span>
    );
  }
  if (state === "unassigned_new") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
        Unassigned
      </span>
    );
  }
  if (state === "sla_at_risk") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
        Due within 6h
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

function ticketAgeDays(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function SupportTicketsBulkBar({
  selectedCount,
  bulkAssignee,
  setBulkAssignee,
  bulkStatus,
  setBulkStatus,
  assignees,
  bulkMutPending,
  onAssign,
  onUpdateStatus,
  className = "",
}: {
  selectedCount: number;
  bulkAssignee: string;
  setBulkAssignee: (v: string) => void;
  bulkStatus: string;
  setBulkStatus: (v: string) => void;
  assignees: Array<{ id: string; full_name: string | null; email: string | null }>;
  bulkMutPending: boolean;
  onAssign: () => void;
  onUpdateStatus: () => void;
  className?: string;
}) {
  if (selectedCount <= 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3", className)}>
      <span className="text-sm text-gray-600">{selectedCount} selected</span>
      <select
        value={bulkAssignee}
        onChange={(e) => setBulkAssignee(e.target.value)}
        className="min-h-11 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
      >
        <option value="">Bulk assign…</option>
        {assignees.map((a) => (
          <option key={a.id} value={a.id}>
            {a.full_name || a.email}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!bulkAssignee || bulkMutPending}
        onClick={onAssign}
        className="min-h-11 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-white disabled:opacity-50"
      >
        Assign
      </button>
      <select
        value={bulkStatus}
        onChange={(e) => setBulkStatus(e.target.value)}
        className="min-h-11 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
      >
        <option value="">Bulk status…</option>
        <option value="in_progress">In progress</option>
        <option value="waiting_customer">Waiting on customer</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </select>
      <button
        type="button"
        disabled={!bulkStatus || bulkMutPending}
        onClick={onUpdateStatus}
        className="min-h-11 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-white disabled:opacity-50"
      >
        Update status
      </button>
    </div>
  );
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function isInsideSupportTicketInboxPanel(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Node)) return false;
  return Boolean(document.getElementById("support-ticket-inbox-panel")?.contains(target));
}

function shouldHandleSupportInboxKeys(target: EventTarget | null): boolean {
  if (isEditableKeyboardTarget(target)) return false;
  if (isInsideSupportTicketInboxPanel(target)) return false;
  if (target instanceof HTMLElement && target.closest("button, a, select, [role=dialog], [role=modal]")) {
    return false;
  }
  return true;
}

function SupportTicketCardChip({
  children,
  title,
  className,
}: {
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", className)}
    >
      {children}
    </span>
  );
}

function SupportTicketCardChipRow({ ticket }: { ticket: SupportTicket }) {
  return (
    <div className="admin-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
      <SupportTicketCardChip title="Priority" className={cn("capitalize", priorityPillClass(ticket.priority))}>
        {ticket.priority}
      </SupportTicketCardChip>
      <SupportTicketCardChip title="Status" className={cn("capitalize", statusPillClass(ticket.status))}>
        {ticket.status.replace(/_/g, " ")}
      </SupportTicketCardChip>
      <AttentionBadge ticket={ticket} />
      {ticket.sla_resolution_due_at ? (
        <SupportTicketCardChip
          title="SLA"
          className={
            isSlaBreached(ticket)
              ? "bg-red-100 font-semibold text-red-800"
              : "bg-gray-100 text-gray-700"
          }
        >
          {isSlaBreached(ticket) ? "SLA overdue" : "SLA due"}{" "}
          {new Date(ticket.sla_resolution_due_at).toLocaleDateString()}
        </SupportTicketCardChip>
      ) : null}
      {ticket.latest_public_email_delivery_status === "failed" ? (
        <SupportTicketCardChip title="Email delivery" className="bg-rose-100 font-semibold text-rose-800">
          Send failed
        </SupportTicketCardChip>
      ) : null}
      {ticket.channel === "email" ? (
        <SupportTicketCardChip title="Channel" className="bg-gray-100 text-gray-700">
          Email
        </SupportTicketCardChip>
      ) : null}
      {groupLabelForSupportTicketCategory(ticket.category) ? (
        <SupportTicketCardChip title="Category group" className="bg-gray-100 text-gray-700">
          {groupLabelForSupportTicketCategory(ticket.category)}
        </SupportTicketCardChip>
      ) : null}
      {ticket.tenant?.name ? (
        <SupportTicketCardChip title="Tenant" className="bg-gray-100 text-gray-700">
          {ticket.tenant.name}
          {ticket.tenant.region_code ? ` (${ticket.tenant.region_code})` : ""}
        </SupportTicketCardChip>
      ) : null}
      {typeof ticket.csat_score === "number" ? (
        <SupportTicketCardChip title="CSAT" className="bg-emerald-100 text-emerald-800">
          CSAT {ticket.csat_score}/5
        </SupportTicketCardChip>
      ) : null}
      <SupportTicketListChips ticket={ticket} />
    </div>
  );
}

function SupportTicketsCompactHeader({
  description,
  actions,
  compactDescription = false,
}: {
  description: string;
  actions: React.ReactNode;
  compactDescription?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-gray-100 pb-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Support tickets</h1>
        {description ? (
          <p
            className={`mt-0.5 text-gray-600 ${compactDescription ? "text-xs text-gray-500" : "max-w-3xl text-sm leading-snug"}`}
            title={compactDescription ? description : undefined}
          >
            {compactDescription ? "Inbox · ↑↓ select · Enter full page · R reply" : description}
          </p>
        ) : null}
      </div>
      <div className="flex w-full flex-shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">{actions}</div>
    </div>
  );
}

function SupportTicketsQueueCountStrip({
  counts,
  onSegment,
}: {
  counts: { open: number; unassigned: number; breaching_sla: number; awaiting_reply: number };
  onSegment: (segment: "open" | "unassigned" | "breaching" | "awaiting") => void;
}) {
  const items = [
    { key: "open" as const, label: "Open", value: counts.open },
    { key: "unassigned" as const, label: "Unassigned", value: counts.unassigned },
    { key: "breaching" as const, label: "SLA", value: counts.breaching_sla },
    { key: "awaiting" as const, label: "Awaiting", value: counts.awaiting_reply },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onSegment(item.key)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 shadow-sm hover:bg-gray-50"
        >
          <span className="text-gray-500">{item.label}</span>
          <span className="tabular-nums text-gray-900">{item.value.toLocaleString()}</span>
        </button>
      ))}
    </div>
  );
}

function SupportTicketCard({
  ticket,
  isSelected,
  isDesktopInbox,
  onSelectDesktop,
  selectable = false,
  isChecked = false,
  onToggleCheck,
  ticketDetailHref,
}: {
  ticket: SupportTicket;
  isSelected: boolean;
  isDesktopInbox: boolean;
  onSelectDesktop: () => void;
  selectable?: boolean;
  isChecked?: boolean;
  onToggleCheck?: () => void;
  ticketDetailHref: string;
}) {
  const hasDraft = hasSupportTicketComposerDraft(ticket.id);
  const customerLabel = ticket.user
    ? ticket.user.full_name || ticket.user.email
    : ticket.provider?.business_name || "—";
  const assigneeLabel = ticket.assigned_user
    ? ticket.assigned_user.full_name || ticket.assigned_user.email
    : "Unassigned";
  const timeLabel = relativeTime(ticket.last_message_at || ticket.updated_at);

  if (isDesktopInbox) {
    const chips: ReactNode[] = [];
    if (ticket.needs_agent_response || ticket.attention_state === "awaiting_agent") {
      chips.push(
        <SupportTicketCardChip key="needs" title="Needs response" className="bg-violet-100 font-semibold text-violet-900">
          Needs reply
        </SupportTicketCardChip>,
      );
    }
    if (ticket.sla_state === "breached" || isSlaBreached(ticket)) {
      chips.push(
        <SupportTicketCardChip key="sla" title="SLA" className="bg-red-100 font-semibold text-red-800">
          SLA
        </SupportTicketCardChip>,
      );
    }
    if (hasDraft) {
      chips.push(
        <SupportTicketCardChip key="draft" title="Draft" className="bg-sky-100 font-semibold text-sky-900">
          Draft
        </SupportTicketCardChip>,
      );
    }
    if (ticket.latest_public_email_delivery_status === "failed") {
      chips.push(
        <SupportTicketCardChip key="email" title="Email" className="bg-rose-100 font-semibold text-rose-800">
          Send failed
        </SupportTicketCardChip>,
      );
    }
    const statusChip = (
      <SupportTicketCardChip key="status" title="Status" className={cn("capitalize", statusPillClass(ticket.status))}>
        {ticket.status.replace(/_/g, " ")}
      </SupportTicketCardChip>
    );

    return (
      <div
        data-ticket-id={ticket.id}
        className={cn(
          "rounded-xl border bg-white shadow-sm transition-all",
          isSelected
            ? "border-primary bg-primary/5 ring-2 ring-primary/25"
            : "border-gray-200 ring-1 ring-gray-950/[0.03] hover:border-gray-300 hover:bg-gray-50",
          ticket.agent_unread && !isSelected && "ring-1 ring-primary/30",
        )}
      >
        <div className="flex gap-2 px-3 py-2">
          {selectable ? (
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0"
              checked={isChecked}
              onChange={() => onToggleCheck?.()}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${ticket.ticket_number}`}
            />
          ) : null}
          <Link
            to={ticketDetailHref}
            onClick={(e) => {
              e.preventDefault();
              onSelectDesktop();
            }}
            aria-current={isSelected ? "true" : undefined}
            className="min-w-0 flex-1"
          >
            <div className="flex items-center gap-2">
              {ticket.agent_unread ? (
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
              ) : null}
              <p
                className={cn(
                  "min-w-0 flex-1 truncate text-sm text-gray-900",
                  ticket.agent_unread ? "font-bold" : "font-semibold",
                )}
              >
                {ticket.subject}
              </p>
              <span className="shrink-0 text-[11px] text-gray-500">{timeLabel}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-600">
              {customerLabel}
              <span className="text-gray-400"> · </span>
              {assigneeLabel}
              <span className="text-gray-400"> · </span>
              <span className="font-mono text-gray-500">{ticket.ticket_number}</span>
            </p>
            {ticket.description?.trim() ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{ticket.description.trim()}</p>
            ) : null}
            <div className="mt-1 flex flex-wrap gap-1">{[statusChip, ...chips].slice(0, 3)}</div>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      data-ticket-id={ticket.id}
      className={cn(
        "rounded-2xl border bg-white shadow-sm transition-all",
        isSelected
          ? "border-primary bg-primary/5 ring-2 ring-primary/25"
          : "border-gray-200 ring-1 ring-gray-950/[0.03] hover:border-gray-300 hover:bg-gray-50",
        ticket.agent_unread && !isSelected && "ring-1 ring-primary/30",
      )}
    >
      <div className={cn("flex gap-2", isDesktopInbox ? "p-3" : "p-4")}>
        {selectable ? (
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0"
            checked={isChecked}
            onChange={() => onToggleCheck?.()}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${ticket.ticket_number}`}
          />
        ) : null}
        <Link
          to={ticketDetailHref}
          onClick={(e) => {
            if (isDesktopInbox) {
              e.preventDefault();
              onSelectDesktop();
            }
          }}
          aria-current={isSelected ? "true" : undefined}
          className="min-w-0 flex-1"
        >
          <div className="flex items-center gap-2">
            {ticket.agent_unread ? (
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
            ) : null}
            <span className="font-mono text-xs font-medium text-gray-500">{ticket.ticket_number}</span>
            {hasDraft ? (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-900">
                Draft
              </span>
            ) : null}
          </div>
          <p
            className={cn(
              "mt-0.5 line-clamp-2 text-gray-900",
              isDesktopInbox ? "text-sm" : "text-base",
              ticket.agent_unread ? "font-bold" : "font-semibold",
            )}
          >
            {ticket.subject}
          </p>
          <p className="mt-1 truncate text-xs text-gray-600">
            {customerLabel}
            <span className="text-gray-400"> · </span>
            {assigneeLabel}
          </p>
          {ticket.support_context_type ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
              About {ticket.support_context_type.replace(/_/g, " ")}
              {ticket.support_context_label ? ` · ${ticket.support_context_label}` : ""}
            </p>
          ) : null}
          <SupportTicketCardChipRow ticket={ticket} />
          <p className="mt-1.5 text-[11px] text-gray-500">
            Updated {new Date(ticket.updated_at).toLocaleDateString()}
          </p>
        </Link>
      </div>
    </div>
  );
}

export function SupportTicketsPage() {
  useAdminDocumentTitle("Support Tickets");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_SUPPORT,
    "Support section access is required for support tickets."
  );
  const { bootstrap } = useAdminSession();
  const isSuperadmin = bootstrap?.isSuperadmin === true;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const everDesktopRef = useRef(false);
  const prevIsDesktopRef = useRef(isDesktop);
  const inboxRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newCategory, setNewCategory] = useState("");
  const [newRequesterType, setNewRequesterType] = useState("admin");
  const [newContextType, setNewContextType] = useState<SupportContextType>("other");
  const applyCreateCategory = useCallback((value: string) => {
    setNewCategory(value);
    if (!value.trim()) return;
    const ctx = contextTypeForCategory(value);
    if (ctx) setNewContextType(ctx);
    const preset = supportTicketPresetFromCategory(value);
    if (preset.priority) setNewPriority(preset.priority);
  }, []);
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
      setNewContextType("other");
      setNewContextLabel("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.supportTickets.all() });
      invalidateAdminShellCounts(qc);
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
        invalidateAdminShellCounts(qc);
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

  const zohoMailHealth = useQuery({
    queryKey: adminQueryKeys.zohoMailConfig(),
    queryFn: () =>
      adminApi.getJson<{
        mailboxes: Array<{ address?: string; inbound_enabled?: boolean; last_sync_at?: string | null }>;
      }>("/api/admin/integrations/zoho-mail"),
    enabled: allowed && isSuperadmin,
    staleTime: 60_000,
  });
  const staleZohoInbound =
    isSuperadmin &&
    (zohoMailHealth.data?.mailboxes ?? []).some((mb) => {
      if (!mb.inbound_enabled) return false;
      const at = mb.last_sync_at ? new Date(mb.last_sync_at).getTime() : 0;
      return !at || Date.now() - at > 15 * 60 * 1000;
    });

  const statusFilter = searchParams.get("status") ?? "all";
  const priorityFilter = searchParams.get("priority") ?? "all";
  const categoryFilter = searchParams.get("category") ?? "all";
  const assignFilter = searchParams.get("assign") ?? "all";
  const sortFilter = searchParams.get("sort") ?? "smart";
  const slaOverdueFilter = searchParams.get("sla_overdue") === "1";
  const needsResponseFilter = searchParams.get("needs_response") === "1";
  const slaStateFilter = searchParams.get("sla_state") ?? "";
  const firstResponseOverdueFilter = searchParams.get("first_response_overdue") === "1";
  const handlingModeFilter = searchParams.get("handling_mode") ?? "";
  const aiHandlingFilter = handlingModeFilter === "assistant";
  const viewFilter = searchParams.get("view");
  const selectedId = searchParams.get("selected");
  const statusGroupFilter = searchParams.get("status_group") ?? "";
  const categoryGroupFilter = searchParams.get("category_group") ?? "";
  const channelFilter = searchParams.get("channel") ?? "all";
  const isTableView = viewFilter === "table";
  const isCardsView = !isTableView;
  const { shellRef: queueShellRef, heightPx: queueShellHeightPx } = useAdminWorkspaceHeight(
    isDesktop && isCardsView,
  );
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
          n.delete("saved_view");
          n.delete("needs_response");
          n.delete("first_response_overdue");
          n.delete("sla_state");
          n.delete("sla_overdue");
          if (value === "needs_response") n.set("needs_response", "1");
          else if (value === "first_response_overdue") n.set("first_response_overdue", "1");
          else if (value === "sla_at_risk") n.set("sla_state", "at_risk");
          else if (value === "sla_breached") {
            n.set("sla_state", "breached");
            n.set("status_group", SUPPORT_TICKET_STATUS_GROUP_ACTIVE);
            n.delete("sla_overdue");
          }
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
          n.delete("saved_view");
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
            status_group: "",
            category_group: "",
            channel: "all",
            handling_mode: "",
          };
          if (value === defaults[key]) n.delete(key);
          else n.set(key, value);
          if (key === "status_group" && value) n.delete("status");
          if (key === "status" && value !== "all") n.delete("status_group");
          if (key === "category_group" && value !== "") n.delete("category");
          if (key === "category" && value !== "all") n.delete("category_group");
          if (["status", "priority", "assign", "sort", "category", "category_group"].includes(key)) {
            n.delete("handling_mode");
          }
          n.set("page", "1");
          return n;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const applyCountSegment = useCallback(
    (segment: "open" | "unassigned" | "breaching" | "awaiting") => {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete("saved_view");
          n.delete("q");
          n.delete("category");
          n.delete("category_group");
          n.delete("channel");
          n.delete("handling_mode");
          n.delete("status");
          n.delete("status_group");
          n.delete("assign");
          n.delete("needs_response");
          n.delete("sla_state");
          n.delete("sla_overdue");
          n.delete("first_response_overdue");
          n.set("page", "1");
          if (segment === "open") {
            n.set("status_group", SUPPORT_TICKET_STATUS_GROUP_ACTIVE);
          } else if (segment === "unassigned") {
            n.set("status_group", SUPPORT_TICKET_STATUS_GROUP_ACTIVE);
            n.set("assign", "unassigned");
          } else if (segment === "breaching") {
            n.set("status_group", SUPPORT_TICKET_STATUS_GROUP_ACTIVE);
            n.set("sla_state", "breached");
          } else if (segment === "awaiting") {
            n.set("needs_response", "1");
          }
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const supportTicketFilterState = useMemo(
    () => ({
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
      statusGroup: statusGroupFilter,
      categoryGroup: categoryGroupFilter,
      channel: channelFilter,
      aiHandling: aiHandlingFilter,
      handlingMode: handlingModeFilter,
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
      needsResponseFilter,
      slaStateFilter,
      firstResponseOverdueFilter,
      statusGroupFilter,
      categoryGroupFilter,
      channelFilter,
      aiHandlingFilter,
      handlingModeFilter,
    ],
  );

  const activeSavedViewId = useMemo(
    () => matchSupportTicketSavedView(supportTicketFilterState),
    [supportTicketFilterState],
  );

  const savedViewParam = searchParams.get("saved_view");

  const queueApiQuery = useMemo(
    () => supportTicketQueueQuery(supportTicketFilterState),
    [supportTicketFilterState],
  );

  const queryString = useMemo(() => `${queueApiQuery}&include_counts=1`, [queueApiQuery]);

  useEffect(() => {
    saveSupportTicketsQueueUiSearch(searchParams);
  }, [searchParams]);

  useEffect(() => {
    if (isDesktop) everDesktopRef.current = true;
  }, [isDesktop]);

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
    enabled: allowed,
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
      invalidateAdminShellCounts(qc);
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

  const ticketDetailPath = useCallback(
    (ticketId: string) => {
      const qs = new URLSearchParams();
      if (queueApiQuery) qs.set("queue", queueApiQuery);
      const tail = qs.toString() ? `?${qs.toString()}` : "";
      return adminSpaTo(`/admin/support-tickets/${encodeURIComponent(ticketId)}${tail}`);
    },
    [queueApiQuery],
  );

  useEffect(() => {
    if (!selectedId) return;
    const action = resolveSupportTicketSelectedNavAction({
      selectedId,
      isDesktop,
      isTableView,
      everDesktop: everDesktopRef.current,
      wasDesktop: prevIsDesktopRef.current,
    });
    prevIsDesktopRef.current = isDesktop;

    if (action === "clear_selected") {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete("selected");
          return n;
        },
        { replace: true },
      );
      return;
    }
    if (action === "open_full_page") {
      if (openedMobileSelectedRef.current === selectedId) return;
      openedMobileSelectedRef.current = selectedId;
      const withoutSelected = new URLSearchParams(searchParams);
      withoutSelected.delete("selected");
      const queueQs = withoutSelected.toString();
      navigate(adminSpaTo(queueQs ? `/admin/support-tickets?${queueQs}` : "/admin/support-tickets"), {
        replace: true,
      });
      navigate(ticketDetailPath(selectedId), {
        state: { queueTicketIds: tickets.map((t) => t.id) },
      });
    }
  }, [
    selectedId,
    isDesktop,
    isTableView,
    navigate,
    searchParams,
    setSearchParams,
    ticketDetailPath,
    tickets,
  ]);

  useEffect(() => {
    if (!isDesktop || isTableView || tickets.length === 0) return;
    // Only auto-select when nothing is selected — do not override after filter changes.
    if (!selectedId) {
      setSelectedTicket(tickets[0].id);
    }
  }, [isDesktop, isTableView, tickets, selectedId, setSelectedTicket]);

  const queueTicketIds = useMemo(() => tickets.map((t) => t.id), [tickets]);

  const selectedTicketIndex = useMemo(() => {
    if (!selectedId) return null;
    const idx = tickets.findIndex((t) => t.id === selectedId);
    return idx >= 0 ? idx : null;
  }, [selectedId, tickets]);

  useEffect(() => {
    if (!isDesktop || isTableView || tickets.length === 0) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (!shouldHandleSupportInboxKeys(e.target)) return;
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
        navigate(ticketDetailPath(currentId), {
          state: { queueTicketIds: tickets.map((t) => t.id) },
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isDesktop,
    isTableView,
    tickets,
    selectedId,
    setSelectedTicket,
    navigate,
    ticketDetailPath,
  ]);

  const clearAllFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams();
        const view = prev.get("view");
        if (view) n.set("view", view);
        return n;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const openedMobileSelectedRef = useRef<string | null>(null);

  const pageDescription =
    isDesktop && isCardsView
      ? "Select a ticket to read and reply in the panel. Use ↑↓ to move between tickets and Enter to open full page. Filters sync to the URL."
      : "Filters sync to the URL; the queue refreshes when you return to this tab and about every minute while it stays open.";

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to={adminSpaTo("/admin/support-tickets/ai-drafts")}
        className="inline-flex min-h-11 items-center rounded-xl border border-primary/30 bg-primary/5 px-4 text-sm font-medium text-primary hover:bg-primary/10"
      >
        AI drafts
      </Link>
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
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
      >
        + New ticket
      </button>
    </div>
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
      setSearchParams((prev) => mergeSupportTicketSavedViewIntoSearchParams(prev, viewId), { replace: true });
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!allowed || !savedViewParam) return;
    if (!SUPPORT_TICKET_SAVED_VIEWS.some((v) => v.id === savedViewParam)) return;
    if (matchSupportTicketSavedView(supportTicketFilterState) === savedViewParam) return;
    applySavedView(savedViewParam);
  }, [allowed, savedViewParam, supportTicketFilterState, applySavedView]);

  const setView = (next: "cards" | "table") => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("view", next);
        if (next === "table") n.delete("selected");
        return n;
      },
      { replace: true }
    );
  };

  if (denied) return denied;

  const useQueueWorkspace = isDesktop && isCardsView;
  const queueShellStyleLoading =
    useQueueWorkspace && queueShellHeightPx != null
      ? ({ height: `${queueShellHeightPx}px` } as const)
      : undefined;

  if (q.isLoading) {
    if (useQueueWorkspace) {
      return (
        <div
          ref={queueShellRef}
          style={queueShellStyleLoading}
          className="flex min-h-0 flex-col gap-3 overflow-hidden px-2 sm:px-0"
        >
          <div className="shrink-0">
            <SupportTicketsCompactHeader
              description="Select a ticket to read and reply in the panel."
              actions={headerActions}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-4">
            <AdminPageSkeleton rows={8} />
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-6 px-2 sm:px-0">
        <SupportTicketsCompactHeader description={pageDescription} actions={headerActions} />
        <AdminPanel>
          <AdminPageSkeleton rows={8} />
        </AdminPanel>
      </div>
    );
  }

  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6 px-2 sm:px-0">
        <SupportTicketsCompactHeader description={pageDescription} actions={headerActions} />
        <AdminPanel>
          <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />
        </AdminPanel>
      </div>
    );
  }

  const categoryGroupLabel =
    SUPPORT_TICKET_CATEGORY_GROUPS_RICH.find(
      (group) =>
        group.id === categoryGroupFilter ||
        group.label.toLowerCase() === categoryGroupFilter.toLowerCase(),
    )?.label ?? categoryGroupFilter.replace(/_/g, " ");
  const activeFilterChips = listSupportTicketActiveFilters(supportTicketFilterState, {
    category: categoryFilter !== "all" ? labelForSupportTicketCategory(categoryFilter) : undefined,
    categoryGroup: categoryGroupFilter ? categoryGroupLabel : undefined,
  });
  const hasFilters = activeFilterChips.length > 0;
  const activeFilterCount = activeFilterChips.length;

  const filterControlClass = (active: boolean) =>
    cn(
      "min-h-11 rounded-lg border px-3 py-2 text-base sm:text-sm",
      active ? "border-primary bg-primary/5 font-medium text-primary" : "border-gray-300 bg-white text-gray-800",
    );

  const queueShellStyle =
    useQueueWorkspace && queueShellHeightPx != null
      ? ({ height: `${queueShellHeightPx}px` } as const)
      : undefined;

  return (
    <div
      ref={useQueueWorkspace ? queueShellRef : undefined}
      style={queueShellStyle}
      className={
        useQueueWorkspace
          ? "flex min-h-0 flex-col gap-3 overflow-hidden px-2 sm:px-0"
          : "space-y-6 px-2 sm:px-0"
      }
    >
      <div className="shrink-0">
        <SupportTicketsCompactHeader
          description={pageDescription}
          actions={headerActions}
          compactDescription={useQueueWorkspace}
        />
      </div>

      <div className={useQueueWorkspace ? "shrink-0 space-y-2" : "contents"}>
      {staleZohoInbound ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          Zoho Mail inbound sync is stale (&gt;15 min). Check Integrations → Zoho Mail or the sync cron.
        </p>
      ) : null}

      {counts ? (
        useQueueWorkspace ? (
          <SupportTicketsQueueCountStrip counts={counts} onSegment={applyCountSegment} />
        ) : (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <AdminMetricCard
              label="Open tickets"
              value={counts.open.toLocaleString()}
              variant="slate"
              className="!p-3 shadow-sm [&_p:nth-of-type(2)]:!text-xl"
              onClick={() => applyCountSegment("open")}
            />
            <AdminMetricCard
              label="Unassigned"
              value={counts.unassigned.toLocaleString()}
              variant="amber"
              className="!p-3 shadow-sm [&_p:nth-of-type(2)]:!text-xl"
              onClick={() => applyCountSegment("unassigned")}
            />
            <AdminMetricCard
              label="Breaching SLA"
              value={counts.breaching_sla.toLocaleString()}
              variant="rose"
              className="!p-3 shadow-sm [&_p:nth-of-type(2)]:!text-xl"
              onClick={() => applyCountSegment("breaching")}
            />
            <AdminMetricCard
              label="Awaiting reply"
              value={counts.awaiting_reply.toLocaleString()}
              variant="violet"
              className="!p-3 shadow-sm [&_p:nth-of-type(2)]:!text-xl"
              onClick={() => applyCountSegment("awaiting")}
            />
          </div>
        )
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
              <p className="mb-1 text-[11px] text-gray-500">Defaults from category; override if needed.</p>
              <select
                value={newContextType}
                onChange={(e) => setNewContextType(e.target.value as SupportContextType)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              >
                {SUPPORT_CONTEXT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
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
                onChange={(e) => applyCreateCategory(e.target.value)}
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
            <button type="button" disabled={createMut.isPending || !newSubject.trim() || !newDescription.trim()} onClick={() => createMut.mutate()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
              {createMut.isPending ? "Creating…" : "Create ticket"}
            </button>
          </div>
        </div>
      </AdminModal>

      <div className="admin-scrollbar flex flex-nowrap items-center gap-2 overflow-x-auto pb-2">
        <AdminSavedViewChips
          views={SUPPORT_TICKET_SAVED_VIEWS}
          activeViewId={activeSavedViewId}
          onSelect={applySavedView}
          className="shrink-0 pb-0"
        />
        {!useQueueWorkspace
          ? SUPPORT_TICKET_CATEGORY_GROUPS_RICH.map((group) => {
              const active =
                categoryGroupFilter === group.id ||
                categoryGroupFilter.toLowerCase() === group.label.toLowerCase();
              return (
                <button
                  key={group.id}
                  type="button"
                  title={group.description}
                  onClick={() => setFilter("category_group", active ? "" : group.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
                    active
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                  )}
                >
                  {group.label}
                </button>
              );
            })
          : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm"
        >
          <Filter className="h-4 w-4" />
          {filtersOpen ? "Hide filters" : "Filter and sort"}
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-gray-900 px-2 py-0.5 text-xs font-semibold text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
        {useQueueWorkspace ? (
          <input
            type="search"
            placeholder="Search tickets…"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            className="min-h-11 min-w-[12rem] flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            aria-label="Search tickets"
          />
        ) : null}
        </div>
        <div className="ml-auto inline-flex rounded-xl border border-gray-300 bg-white">
          <button
            type="button"
            onClick={() => setView("cards")}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-l-xl px-3 ${
              isCardsView ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
            aria-label="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-r-xl px-3 ${
              isTableView ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
            aria-label="Table view"
          >
            <LayoutList className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AdminPanel className={filtersOpen ? "block" : "hidden"}>
        <div className="flex flex-col gap-4">
          {activeFilterChips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2" aria-label="Selected filters">
              <span className="text-xs font-medium text-gray-500">Selected</span>
              {activeFilterChips.map((chip) => (
                <span
                  key={chip.id}
                  className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary"
                >
                  {chip.label}
                </span>
              ))}
              <button
                type="button"
                className="text-xs font-medium text-gray-600 underline-offset-2 hover:underline"
                onClick={clearAllFilters}
              >
                Clear all
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-500">No filters selected. The queue is showing every ticket.</p>
          )}
          {useQueueWorkspace ? (
            <div className="flex flex-wrap gap-2">
              {SUPPORT_TICKET_CATEGORY_GROUPS_RICH.map((group) => {
                const active =
                  categoryGroupFilter === group.id ||
                  categoryGroupFilter.toLowerCase() === group.label.toLowerCase();
                return (
                  <button
                    key={group.id}
                    type="button"
                    title={group.description}
                    onClick={() => setFilter("category_group", active ? "" : group.id)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
                      active
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                    )}
                  >
                    {group.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
            {useQueueWorkspace ? null : (
            <input
              type="search"
              placeholder="Search ticket #, booking no., subject, or description…"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              className="min-h-11 w-full flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base sm:text-sm"
            />
            )}
            <select
              value={statusGroupFilter}
              onChange={(e) => setFilter("status_group", e.target.value)}
              aria-label="Status group"
              className={filterControlClass(Boolean(statusGroupFilter))}
            >
              <option value="">All status groups</option>
              <option value="active">Active queue</option>
              <option value="resolved_closed">Resolved / closed</option>
            </select>
            <select
              value={statusGroupFilter ? "all" : statusFilter}
              onChange={(e) => setFilter("status", e.target.value)}
              aria-label="Status"
              className={filterControlClass(!statusGroupFilter && statusFilter !== "all")}
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
              aria-label="Priority"
              className={filterControlClass(priorityFilter !== "all")}
            >
              <option value="all">All priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <select
              value={categoryFilter}
              onChange={(e) => setFilter("category", e.target.value)}
              aria-label="Category"
              className={cn(filterControlClass(categoryFilter !== "all"), "w-full sm:max-w-md")}
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
              aria-label="Assignee"
              className={filterControlClass(assignFilter !== "all")}
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
              aria-label="Sort"
              className={cn(filterControlClass(sortFilter !== "smart"), "sm:w-56")}
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
              aria-label="Attention"
              className={filterControlClass(Boolean(attentionFilter))}
            >
              <option value="">All attention states</option>
              <option value="needs_response">Needs response</option>
              <option value="first_response_overdue">First reply overdue</option>
              <option value="sla_at_risk">Due within 6h</option>
              <option value="sla_breached">SLA breached</option>
            </select>
            <select
              value={channelFilter}
              onChange={(e) => setFilter("channel", e.target.value)}
              aria-label="Channel"
              className={filterControlClass(channelFilter !== "all")}
            >
              <option value="all">All channels</option>
              <option value="email">Email</option>
              <option value="app">App</option>
            </select>
            <select
              value={handlingModeFilter === "assistant" || handlingModeFilter === "human" ? handlingModeFilter : "all"}
              onChange={(e) =>
                setFilter("handling_mode", e.target.value === "all" ? "" : e.target.value)
              }
              aria-label="Handling"
              className={filterControlClass(handlingModeFilter === "assistant" || handlingModeFilter === "human")}
            >
              <option value="all">All handling</option>
              <option value="assistant">AI handling</option>
              <option value="human">Human handling</option>
            </select>
          </div>
        </div>
      </AdminPanel>
      </div>

      {tickets.length === 0 ? (
        useQueueWorkspace ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <EmptyState
              title="No support tickets"
              description={hasFilters ? "No tickets match your filters." : "No support tickets yet."}
              action={
                hasFilters ? (
                  <button
                    type="button"
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                    onClick={clearAllFilters}
                  >
                    Clear filters
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <EmptyState
            title="No support tickets"
            description={hasFilters ? "No tickets match your filters." : "No support tickets yet."}
            action={
              hasFilters ? (
                <button
                  type="button"
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                  onClick={clearAllFilters}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        )
      ) : (
        <div className={useQueueWorkspace ? "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden" : undefined}>
          {isCardsView && !useQueueWorkspace ? (
            <div>
            <SupportTicketsBulkBar
              selectedCount={selectedIds.length}
              bulkAssignee={bulkAssignee}
              setBulkAssignee={setBulkAssignee}
              bulkStatus={bulkStatus}
              setBulkStatus={setBulkStatus}
              assignees={assignees?.assignees ?? []}
              bulkMutPending={bulkMut.isPending}
              onAssign={() => bulkMut.mutate({ ticket_ids: selectedIds, assigned_to: bulkAssignee })}
              onUpdateStatus={() => bulkMut.mutate({ ticket_ids: selectedIds, status: bulkStatus })}
            />
            </div>
          ) : null}

          {isCardsView && !useQueueWorkspace ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <label className="inline-flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={tickets.length > 0 && selectedIds.length === tickets.length}
                  onChange={(e) =>
                    setSelectedIds(e.target.checked ? tickets.map((t) => t.id) : [])
                  }
                  aria-label="Select all tickets on page"
                />
                Select all on page
              </label>
            </div>
          ) : null}

          {isCardsView && isDesktop ? (
            <div
              ref={inboxRef}
              tabIndex={0}
              className="grid min-h-0 flex-1 grid-cols-[minmax(280px,360px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-4 overflow-hidden"
              aria-label="Support ticket inbox"
            >
              <div
                id="support-ticket-inbox-list"
                ref={listScrollRef}
                className="flex h-full min-h-0 flex-col overflow-hidden"
              >
              <div className="shrink-0">
                <SupportTicketsBulkBar
                  selectedCount={selectedIds.length}
                  bulkAssignee={bulkAssignee}
                  setBulkAssignee={setBulkAssignee}
                  bulkStatus={bulkStatus}
                  setBulkStatus={setBulkStatus}
                  assignees={assignees?.assignees ?? []}
                  bulkMutPending={bulkMut.isPending}
                  onAssign={() => bulkMut.mutate({ ticket_ids: selectedIds, assigned_to: bulkAssignee })}
                  onUpdateStatus={() => bulkMut.mutate({ ticket_ids: selectedIds, status: bulkStatus })}
                />
              </div>
              <label className="inline-flex min-h-9 shrink-0 items-center gap-2 px-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={tickets.length > 0 && selectedIds.length === tickets.length}
                  onChange={(e) =>
                    setSelectedIds(e.target.checked ? tickets.map((t) => t.id) : [])
                  }
                  aria-label="Select all tickets on page"
                />
                Select all on page
              </label>
              <AdminVirtualList
                items={tickets}
                estimateSize={96}
                threshold={12}
                fill
                activeIndex={selectedTicketIndex}
                ariaLabel="Support ticket list"
                renderItem={(ticket) => (
                  <SupportTicketCard
                    key={ticket.id}
                    ticket={ticket}
                    isSelected={selectedId === ticket.id}
                    isDesktopInbox
                    onSelectDesktop={() => setSelectedTicket(ticket.id)}
                    selectable
                    isChecked={selectedIds.includes(ticket.id)}
                    ticketDetailHref={ticketDetailPath(ticket.id)}
                    onToggleCheck={() =>
                      setSelectedIds((prev) =>
                        prev.includes(ticket.id)
                          ? prev.filter((id) => id !== ticket.id)
                          : [...prev, ticket.id],
                      )
                    }
                  />
                )}
              />
              <div className="flex shrink-0 flex-col items-center justify-between gap-2 border-t border-gray-100 px-1 py-2 text-xs text-gray-600 sm:flex-row">
                <p>
                  Showing {rangeStart}–{rangeEnd} of {total}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 disabled:opacity-40"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 disabled:opacity-40"
                    disabled={offset + tickets.length >= total}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              </div>
              <div
                id="support-ticket-inbox-panel"
                className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ring-1 ring-gray-950/[0.03]"
              >
                {selectedId ? (
                  <SupportTicketDetailView
                    id={selectedId}
                    variant="panel"
                    queueTicketIds={queueTicketIds}
                    selectedOffPage={!tickets.some((t) => t.id === selectedId)}
                    onNavigateNext={(nextId) => {
                      if (nextId) setSelectedTicket(nextId);
                      else setSearchParams((prev) => {
                        const n = new URLSearchParams(prev);
                        n.delete("selected");
                        return n;
                      }, { replace: true });
                    }}
                  />
                ) : (
                  <div className="p-4">
                    <EmptyState
                      title="Select a ticket"
                      description="Choose a ticket from the list to read and reply without leaving the queue."
                    />
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {isCardsView && !isDesktop ? (
            <AdminVirtualList
              items={tickets}
              estimateSize={176}
              threshold={999}
              ariaLabel="Support ticket cards"
              renderItem={(ticket) => (
                <SupportTicketCard
                  key={ticket.id}
                  ticket={ticket}
                  isSelected={false}
                  isDesktopInbox={false}
                  onSelectDesktop={() => {}}
                  selectable
                  isChecked={selectedIds.includes(ticket.id)}
                  ticketDetailHref={ticketDetailPath(ticket.id)}
                  onToggleCheck={() =>
                    setSelectedIds((prev) =>
                      prev.includes(ticket.id)
                        ? prev.filter((id) => id !== ticket.id)
                        : [...prev, ticket.id],
                    )
                  }
                />
              )}
            />
          ) : null}

          <AdminDataTable
            className={cn("admin-scrollbar", isTableView ? "" : "hidden")}
            tableClassName="min-w-[72rem]"
          >
            <SupportTicketsBulkBar
              selectedCount={selectedIds.length}
              bulkAssignee={bulkAssignee}
              setBulkAssignee={setBulkAssignee}
              bulkStatus={bulkStatus}
              setBulkStatus={setBulkStatus}
              assignees={assignees?.assignees ?? []}
              bulkMutPending={bulkMut.isPending}
              onAssign={() => bulkMut.mutate({ ticket_ids: selectedIds, assigned_to: bulkAssignee })}
              onUpdateStatus={() => bulkMut.mutate({ ticket_ids: selectedIds, status: bulkStatus })}
              className="border-b border-gray-100"
            />
            <AdminTableHead>
              <tr>
                <AdminTh className="sticky left-0 z-10 bg-gray-50">
                  <input
                    type="checkbox"
                    checked={tickets.length > 0 && selectedIds.length === tickets.length}
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? tickets.map((t) => t.id) : [])
                    }
                    aria-label="Select all tickets on page"
                  />
                </AdminTh>
                <AdminTh className="sticky left-10 z-10 bg-gray-50">Ticket #</AdminTh>
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
                  <AdminTd className="sticky left-0 z-[1] bg-white">
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
                  <AdminTd className="sticky left-10 z-[1] bg-white font-mono text-xs">
                    {ticket.ticket_number}
                  </AdminTd>
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
                        <SupportTicketListChips ticket={ticket} />
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
                        {adminSupportContextHref(ticket.support_context_type, ticket.support_context_id) ? (
                          <Link
                            to={adminSpaTo(
                              adminSupportContextHref(ticket.support_context_type, ticket.support_context_id) ?? "/",
                            )}
                            className="mt-1 inline-block font-medium text-gray-900 underline"
                          >
                            Open
                          </Link>
                        ) : null}
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
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusPillClass(ticket.status)}`}>
                      {ticket.status.replace(/_/g, " ")}
                    </span>
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
                      to={ticketDetailPath(ticket.id)}
                      state={{ queueTicketIds: tickets.map((t) => t.id) }}
                    >
                      Open
                    </Link>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>

          {!useQueueWorkspace ? (
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
          ) : null}
        </div>
      )}
    </div>
  );
}
