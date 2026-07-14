import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass, adminToolbarButtonClass } from "@/lib/adminUi";
import { cn } from "@/lib/cn";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";
import {
  LEAD_STAGE_BADGE as STAGE_BADGE,
  LEAD_STAGE_BRANCHES,
  LEAD_STAGE_DESCRIPTIONS,
  LEAD_STAGE_DOT as STAGE_DOT,
  LEAD_STAGE_FILTERS as STAGES,
  LEAD_STAGE_LABELS as STAGE_LABELS,
  LEAD_STAGE_PRIMARY_FLOW,
  getLeadStageLabel,
  getLeadStageNextAction,
} from "@/lib/providerOpsLeadStages";
import {
  Search, Upload, Download, Plus, LayoutGrid, LayoutList,
  Phone, Mail, MapPin, Calendar, Tag, User, ChevronDown,
  Clock, MessageSquare, MessageCircle, ArrowUpDown, CheckSquare, Square,
  Trash2, UserPlus, X, ChevronUp, Filter, MoreHorizontal, RotateCcw,
  StickyNote, TrendingUp, ArrowRight, ExternalLink, Pencil,
} from "lucide-react";
import { WhatsAppSendModal } from "@/components/whatsapp/WhatsAppSendModal";
import { BulkWhatsAppModal } from "@/components/whatsapp/BulkWhatsAppModal";
import { handleLeadConcurrent409 } from "@/lib/handleLeadConcurrentUpdate";
import {
  AssigneeSearchPanel,
  LeadAssigneeInline,
  labelOf,
  type AssignableUser,
} from "@/components/provider-ops/LeadAssigneeInline";
import { LeadVoiceDialer } from "@/components/provider-ops/LeadVoiceDialer";

const PAGE_SIZE = 50;
/** Keeps inbox + embedded detail panel aligned when multiple admins work the same queue. */
const OPS_LEADS_REFETCH_MS = 45_000;
const ACTIVITY_ICONS: Record<string, typeof MessageSquare> = {
  note: StickyNote, stage_change: TrendingUp, stage_changed: TrendingUp,
  call: Phone, call_logged: Phone,
  email: Mail, email_sent: Mail, sms_sent: MessageSquare,
  whatsapp_sent: MessageCircle, whatsapp_received: MessageCircle,
  do_not_contact_set: X, do_not_contact_cleared: CheckSquare,
  invite_accepted: UserPlus, match_confirmed: CheckSquare,
  assignment_changed: User, task_created: CheckSquare,
  task_completed: CheckSquare, meeting: Calendar, default: MessageSquare,
};

interface LeadCategory {
  global_category_id: string;
  global_service_categories: { id: string; name: string; slug: string; icon: string | null } | null;
}

interface Lead {
  id: string;
  business_name: string | null;
  contact_person_name: string | null;
  email: string | null;
  phone_e164: string | null;
  commercial_stage: string;
  source: string;
  suggested_location_text: string | null;
  country: string | null;
  created_at: string;
  /** API may return string[], a JSON string, or legacy shapes — normalize with `asLeadTagList`. */
  tags?: unknown;
  description?: string | null;
  notes?: string | null;
  assigned_to?: string | null;
  assigned_user?: { id: string; email: string | null; full_name: string | null } | null;
  matched_provider_id?: string | null;
  provider_lead_categories?: LeadCategory[] | unknown;
  /** Wasender reachability check — surfaced as a badge in the inbox. */
  whatsapp_status?: "unknown" | "verified" | "not_found" | "check_failed" | null;
  whatsapp_checked_at?: string | null;
  do_not_contact?: boolean;
  do_not_contact_at?: string | null;
  do_not_contact_reason?: string | null;
  tenant_id?: string | null;
  phone_lookup_status?: string | null;
  phone_lookup_at?: string | null;
  updated_at?: string;
  overdue_task_count?: number;
  invite_sent_at?: string | null;
  invite_accepted_at?: string | null;
  onboarding_data?: Record<string, unknown> | null;
  deleted_at?: string | null;
}

type DetailActivityTab = "timeline" | "comms" | "tasks";

function leadInviteStatusChip(lead: Lead): { label: string; className: string } | null {
  if (lead.invite_accepted_at) {
    return { label: "Invite accepted", className: "bg-emerald-100 text-emerald-700 ring-emerald-200/80" };
  }
  if (lead.invite_sent_at) {
    return { label: "Invite sent", className: "bg-indigo-100 text-indigo-700 ring-indigo-200/80" };
  }
  return null;
}

function leadHasOnboardingData(lead: Lead): boolean {
  const od = lead.onboarding_data;
  if (!od || typeof od !== "object") return false;
  return Object.keys(od).filter((k) => k !== "invite_token").length > 0;
}

/** Shows whether the lead phone was verified on WhatsApp (Wasender check). */
function WhatsAppStatusChip({ status, compact = false }: { status?: Lead["whatsapp_status"]; compact?: boolean }) {
  const s = status || "unknown";
  const config: Record<string, { label: string; bg: string; fg: string; dot: string; title: string }> = {
    verified: {
      label: compact ? "WA ✓" : "WhatsApp verified",
      bg: "bg-emerald-100",
      fg: "text-emerald-700",
      dot: "bg-emerald-500",
      title: "Verified active on WhatsApp",
    },
    not_found: {
      label: compact ? "No WA" : "Not on WhatsApp",
      bg: "bg-amber-50",
      fg: "text-amber-700",
      dot: "bg-amber-400",
      title: "Number is not on WhatsApp",
    },
    check_failed: {
      label: compact ? "WA ?" : "Check failed",
      bg: "bg-rose-50",
      fg: "text-rose-700",
      dot: "bg-rose-400",
      title: "WhatsApp check failed — try again",
    },
    unknown: {
      label: compact ? "WA ·" : "Not checked",
      bg: "bg-zinc-100",
      fg: "text-zinc-600",
      dot: "bg-zinc-400",
      title: "WhatsApp reachability not checked yet",
    },
  };
  const c = config[s] || config.unknown;
  return (
    <span
      title={c.title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${c.bg} ${c.fg}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

/** Do-not-contact badge with optional admin toggle. */
function DoNotContactChip({
  active,
  compact = false,
  onToggle,
  toggling = false,
}: {
  active: boolean;
  compact?: boolean;
  onToggle?: () => void;
  toggling?: boolean;
}) {
  if (!active && !onToggle) return null;
  return (
    <button
      type="button"
      disabled={!onToggle || toggling}
      onClick={onToggle}
      title={
        active
          ? "Do not contact — outbound SMS/WhatsApp blocked. Click to clear."
          : "Mark as do-not-contact"
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium touch-manipulation transition-colors",
        active
          ? "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200 hover:bg-rose-200/80"
          : "border border-dashed border-gray-300 bg-white text-gray-500 hover:border-rose-300 hover:text-rose-700",
        toggling && "opacity-60",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-rose-500" : "bg-gray-300")} />
      {active ? (compact ? "DNC" : "Do not contact") : compact ? "+ DNC" : "Mark DNC"}
    </button>
  );
}

function asLeadTagList(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    try {
      const p = JSON.parse(t) as unknown;
      if (Array.isArray(p)) return p.map(String);
    } catch {
      return t
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [t];
  }
  return [];
}

function asLeadCategoryList(raw: unknown): LeadCategory[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as LeadCategory[];
  return [];
}

function assigneeDisplayName(lead: Lead): string {
  if (!lead.assigned_to) return "—";
  const u = lead.assigned_user;
  if (u && typeof u === "object") {
    const n = typeof u.full_name === "string" ? u.full_name.trim() : "";
    const e = typeof u.email === "string" ? u.email.trim() : "";
    if (n || e) return n || e;
  }
  return `${lead.assigned_to.slice(0, 8)}…`;
}

function parseCategoryIdsParam(sp: URLSearchParams): string[] {
  const values = [...sp.getAll("category_ids"), ...sp.getAll("category_id")];
  const seen = new Set<string>();
  values.forEach((value) => {
    value.split(",").forEach((part) => {
      const id = part.trim();
      if (id) seen.add(id);
    });
  });
  return [...seen];
}

interface LeadsPayload {
  data: Lead[];
  meta: { page: number; limit: number; total: number; has_more: boolean };
  stage_counts: Record<string, number>;
  filter_options?: {
    countries?: Array<{ value: string; label: string; count: number }>;
    provinces?: Array<{ value: string; label: string; count: number; country?: string | null }>;
    categories?: Array<{ id: string; name: string; count: number }>;
    assignees?: Array<{ value: string; label: string; count: number }>;
  };
}

interface Activity {
  id?: string;
  activity_type: string;
  description: string;
  created_at: string;
  created_by_name?: string | null;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ProviderOpsLeadsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const stage = sp.get("stage") || "all";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const search = sp.get("search") || "";
  const country = sp.get("country") || "";
  const province = sp.get("province") || "";
  const categoryIds = useMemo(() => parseCategoryIdsParam(sp), [sp]);
  const categoryKey = categoryIds.join(",");
  const assignedToFilter = sp.get("assigned_to") || "";
  const sortBy = sp.get("sort") || "created_at";
  const sortDir = sp.get("dir") || "desc";
  const viewParam = sp.get("view");
  const deletedView = sp.get("deleted") === "only";

  const [searchInput, setSearchInput] = useState(search);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [density, setDensity] = useState<"comfortable" | "compact">(() => {
    if (typeof window === "undefined") return "comfortable";
    return window.localStorage.getItem("providerOpsLeadDensity") === "compact" ? "compact" : "comfortable";
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    total_rows_in_file: number;
    skipped_empty: number;
    skipped_duplicates_count: number;
    recovered_rows: number;
    warnings: { row: number; field: string; message: string }[];
    skipped_duplicates: {
      row: number;
      field: string;
      value: string;
      existing_lead_id: string | null;
      existing_lead_name: string | null;
      reason: "in_file" | "existing_lead";
    }[];
    error?: string | null;
  } | null>(null);
  const [importDetailsOpen, setImportDetailsOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [detailPanelWidth, setDetailPanelWidth] = useState(480);
  const resizingRef = useRef(false);
  const [whatsAppLead, setWhatsAppLead] = useState<Lead | null>(null);
  const [showBulkWhatsApp, setShowBulkWhatsApp] = useState(false);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);

  useEffect(() => {
    if (viewParam === "table" || viewParam === "card") {
      setViewMode(viewParam);
      return;
    }
    if (window.matchMedia("(max-width: 640px)").matches) setViewMode("card");
  }, [viewParam]);

  const setLeadView = (next: "table" | "card") => {
    setViewMode(next);
    const n = new URLSearchParams(sp);
    n.set("view", next);
    setSp(n, { replace: true });
  };

  const setLeadDensity = (next: "comfortable" | "compact") => {
    setDensity(next);
    window.localStorage.setItem("providerOpsLeadDensity", next);
  };

  const qk = useMemo(
    () =>
      adminQueryKeys.providerOps.leads(
        `s=${stage}|p=${page}|q=${search}|c=${country}|prov=${province}|cat=${categoryKey}|a=${assignedToFilter}|sb=${sortBy}|sd=${sortDir}|del=${deletedView ? "only" : "active"}`,
      ),
    [stage, page, search, country, province, categoryKey, assignedToFilter, sortBy, sortDir, deletedView],
  );

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (stage !== "all") p.set("stage", stage);
      p.set("page", String(page));
      p.set("limit", String(PAGE_SIZE));
      if (search) p.set("search", search);
      if (country) p.set("country", country);
      if (province) p.set("province", province);
      categoryIds.forEach((id) => p.append("category_ids", id));
      if (assignedToFilter) p.set("assigned_to", assignedToFilter);
      if (sortBy) p.set("sort", sortBy);
      if (sortDir) p.set("dir", sortDir);
      if (deletedView) p.set("deleted", "only");
      return adminApi.getJson<LeadsPayload>(`/api/admin/provider-ops/leads?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
    refetchInterval: OPS_LEADS_REFETCH_MS,
    refetchOnWindowFocus: true,
  });

  const rows = q.data?.data ?? [];
  const total = q.data?.meta?.total ?? 0;
  const hasMore = q.data?.meta?.has_more ?? false;
  const stageCounts = q.data?.stage_counts ?? {};
  const filterOptions = q.data?.filter_options;
  const countryOptions = filterOptions?.countries ?? [];
  const provinceOptions = useMemo(
    () =>
      (filterOptions?.provinces ?? []).filter((opt) => !country || !opt.country || opt.country === country),
    [filterOptions?.provinces, country],
  );
  const categoryOptions = filterOptions?.categories ?? [];
  const assigneeFilterOptions = filterOptions?.assignees ?? [];
  const selectedCategoryNames = categoryIds.map((id) => categoryOptions.find((c) => c.id === id)?.name ?? "selected");

  const selectedLead = rows.find((r) => r.id === selectedLeadId) ?? null;

  // ── Detail query for selected lead ──
  const detailQ = useQuery({
    queryKey: adminQueryKeys.providerOps.leadDetail(selectedLeadId!),
    queryFn: () => adminApi.getJson<Record<string, unknown>>(`/api/admin/provider-ops/leads/${selectedLeadId}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!selectedLeadId,
    refetchInterval: selectedLeadId ? OPS_LEADS_REFETCH_MS : false,
    refetchOnWindowFocus: true,
  });

  const activitiesQ = useQuery({
    queryKey: adminQueryKeys.providerOps.leadActivities(selectedLeadId!),
    queryFn: () => adminApi.getJson<{ data: Activity[] }>(`/api/admin/provider-ops/leads/${selectedLeadId}/activities`, { timeoutMs: 30_000 }),
    enabled: allowed && !!selectedLeadId,
    refetchInterval: selectedLeadId ? OPS_LEADS_REFETCH_MS : false,
    refetchOnWindowFocus: true,
  });

  /**
   * Lead detail below the `lg` breakpoint is a bottom sheet portaled to `document.body` so
   * `position:fixed` is tied to the viewport. Without a portal, ancestors
   * (e.g. overflow/transform in the admin shell) can make the sheet paint at
   * the document bottom so users must scroll the page to see it.
   */
  useEffect(() => {
    if (!selectedLeadId) return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const syncBodyScroll = () => {
      document.body.style.overflow = mq.matches ? "hidden" : "";
    };
    syncBodyScroll();
    mq.addEventListener("change", syncBodyScroll);
    return () => {
      mq.removeEventListener("change", syncBodyScroll);
      document.body.style.overflow = "";
    };
  }, [selectedLeadId]);

  // ── Mutations ──
  const stageChangeMut = useMutation({
    mutationFn: ({
      id,
      newStage,
      expected_updated_at,
    }: {
      id: string;
      newStage: string;
      expected_updated_at?: string;
    }) =>
      adminApi.patchJson(`/api/admin/provider-ops/leads/${id}/stage`, {
        stage: newStage,
        ...(expected_updated_at ? { expected_updated_at } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      adminToast.success("Stage updated");
    },
    onError: (e: Error) => {
      if (handleLeadConcurrent409(e)) {
        void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
        return;
      }
      adminToast.error(`Stage update failed: ${e.message}`);
    },
  });

  const runBulkAssign = useCallback(
    async (u: AssignableUser) => {
      const ids = [...selectedIds];
      setBulkAssignOpen(false);
      for (const id of ids) {
        const row = rows.find((r) => r.id === id);
        try {
          await adminApi.patchJson(`/api/admin/provider-ops/leads/${id}/assign`, {
            assigned_to: u.id,
            assigned_to_name: labelOf(u),
            ...(row?.updated_at ? { expected_updated_at: row.updated_at } : {}),
          });
        } catch (e) {
          adminToast.error(e instanceof Error ? e.message : "Assignment failed");
          void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
          return;
        }
      }
      adminToast.success(`Assigned ${ids.length} lead(s)`);
      setSelectedIds(new Set());
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
    },
    [selectedIds, rows, qc],
  );

  const assignLeadMut = useMutation({
    mutationFn: (args: {
      leadId: string;
      assigned_to: string;
      assigned_to_name?: string;
      expected_updated_at?: string;
    }) =>
      adminApi.patchJson(`/api/admin/provider-ops/leads/${args.leadId}/assign`, {
        assigned_to: args.assigned_to || null,
        ...(args.assigned_to_name ? { assigned_to_name: args.assigned_to_name } : {}),
        ...(args.expected_updated_at ? { expected_updated_at: args.expected_updated_at } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      adminToast.success("Assignment updated");
    },
    onError: (e: Error) => {
      if (handleLeadConcurrent409(e)) {
        void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
        return;
      }
      adminToast.error(`Assign failed: ${e.message}`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/provider-ops/leads/${id}`),
    onSuccess: () => {
      setSelectedLeadId(null);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      adminToast.success("Lead moved to trash");
    },
    onError: (e: Error) => adminToast.error(`Delete failed: ${e.message}`),
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) =>
      adminApi.postJson(`/api/admin/provider-ops/leads/${id}/restore`, {}),
    onSuccess: () => {
      setSelectedLeadId(null);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      adminToast.success("Lead restored");
    },
    onError: (e: Error) => adminToast.error(`Restore failed: ${e.message}`),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) =>
      adminApi.postJson<{ deleted: number; skipped_matched: string[]; not_found: string[] }>(
        "/api/admin/provider-ops/leads/bulk-delete",
        { ids },
      ),
    onSuccess: (data, idsRequested) => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      setSelectedIds(new Set());
      setSelectedLeadId((cur) => {
        if (!cur || !idsRequested.includes(cur)) return cur;
        if (data.skipped_matched.includes(cur)) return cur;
        return null;
      });
      if (data.deleted > 0) {
        adminToast.success(`Deleted ${data.deleted} lead${data.deleted === 1 ? "" : "s"}`);
      } else if (data.skipped_matched.length > 0) {
        adminToast.warning("No leads deleted — matched leads must be unlinked first");
      } else {
        adminToast.info("No leads deleted");
      }
      if (data.skipped_matched.length > 0 && data.deleted > 0) {
        adminToast.warning(
          `${data.skipped_matched.length} matched lead${data.skipped_matched.length === 1 ? "" : "s"} skipped (unlink from a provider to delete)`,
        );
      }
      if (data.not_found.length > 0) {
        adminToast.info(`${data.not_found.length} id${data.not_found.length === 1 ? "" : "s"} not found (already removed?)`);
      }
    },
    onError: (e: Error) => adminToast.error(`Bulk delete failed: ${e.message}`),
  });

  const [noteText, setNoteText] = useState("");
  const addNoteMut = useMutation({
    mutationFn: (leadId: string) =>
      adminApi.postJson(`/api/admin/provider-ops/leads/${leadId}/activities`, { activity_type: "note", description: noteText.trim() }),
    onSuccess: () => {
      setNoteText("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(selectedLeadId!) });
      adminToast.success("Note added");
    },
    onError: (e: Error) => adminToast.error(`Failed: ${e.message}`),
  });

  const logCallMut = useMutation({
    mutationFn: (leadId: string) =>
      adminApi.postJson(`/api/admin/provider-ops/leads/${leadId}/activities`, {
        activity_type: "call_logged",
        description: noteText.trim() || "Phone call with lead",
        metadata: { direction: "outbound" },
      }),
    onSuccess: () => {
      setNoteText("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(selectedLeadId!) });
      adminToast.success("Call logged");
    },
    onError: (e: Error) => adminToast.error(`Failed: ${e.message}`),
  });

  const updateLeadMut = useMutation({
    mutationFn: (fields: Record<string, unknown>) => {
      const sid = selectedLeadId;
      if (!sid) throw new Error("No lead selected");
      const fromDetail = qc.getQueryData(adminQueryKeys.providerOps.leadDetail(sid)) as Lead | undefined;
      const fromList = rows.find((r) => r.id === sid);
      const tokenRaw = fromDetail?.updated_at ?? fromList?.updated_at;
      const token = typeof tokenRaw === "string" ? tokenRaw : undefined;
      return adminApi.patchJson(`/api/admin/provider-ops/leads/${sid}`, {
        ...fields,
        ...(token ? { expected_updated_at: token } : {}),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadDetail(selectedLeadId!) });
      adminToast.success("Lead updated");
    },
    onError: (e: Error) => {
      if (handleLeadConcurrent409(e)) {
        void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
        return;
      }
      adminToast.error(`Update failed: ${e.message}`);
    },
  });

  // ── Helpers ──
  function setStage(next: string) {
    const n = new URLSearchParams(sp);
    if (next === "all") n.delete("stage"); else n.set("stage", next);
    n.delete("page");
    setSp(n, { replace: true });
  }

  function commitSearch() {
    const n = new URLSearchParams(sp);
    if (searchInput.trim()) n.set("search", searchInput.trim()); else n.delete("search");
    n.delete("page");
    setSp(n, { replace: true });
  }

  function toggleSort(col: string) {
    const n = new URLSearchParams(sp);
    if (sortBy === col) {
      n.set("dir", sortDir === "asc" ? "desc" : "asc");
    } else {
      n.set("sort", col);
      n.set("dir", "desc");
    }
    n.delete("page");
    setSp(n, { replace: true });
  }

  function toggleSelectAll() {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function confirmBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const n = ids.length;
    const msg =
      n === 1
        ? "Delete this lead? This cannot be undone. If it is linked to a provider account, it will be skipped."
        : `Delete ${n} leads? This cannot be undone. Leads linked to a provider account will be skipped.`;
    if (!confirm(msg)) return;
    bulkDeleteMut.mutate(ids);
  }

  const handleImportFile = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "tsv" && ext !== "txt") {
      adminToast.error("Unsupported file type. Please upload a .csv, .tsv, or .txt file.");
      return;
    }
    try {
      setImporting(true);
      setImportResult(null);
      setImportDetailsOpen(false);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/provider-ops/leads/import", { method: "POST", body: formData, credentials: "include" });
      const json = await res.json();
      if (!res.ok) {
        adminToast.error(json?.error?.message ?? json?.message ?? "Import failed — please check your file and try again");
        return;
      }
      const data = json.data;
      setImportResult({
        imported: data.imported,
        total_rows_in_file: data.total_rows_in_file,
        skipped_empty: data.skipped_empty,
        skipped_duplicates_count: data.skipped_duplicates_count ?? 0,
        recovered_rows: data.recovered_rows ?? 0,
        warnings: data.warnings || [],
        skipped_duplicates: data.skipped_duplicates || [],
        error: data.error ?? null,
      });
      const dupCount = data.skipped_duplicates_count ?? 0;
      const recoveredCount = data.recovered_rows ?? 0;
      const toastParts = [`Imported ${data.imported as number} leads`];
      if (dupCount > 0) toastParts.push(`${dupCount} duplicates skipped`);
      if (recoveredCount > 0) toastParts.push(`${recoveredCount} rows auto-recovered`);
      if (data.error) toastParts.push("import partially completed");
      adminToast.success(toastParts.join(" · "));
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [qc]);

  const downloadImportReport = useCallback(() => {
    if (!importResult) return;
    const rows: string[][] = [["row", "type", "field", "value", "message", "existing_lead_id", "existing_lead_name"]];
    for (const dup of importResult.skipped_duplicates) {
      rows.push([
        String(dup.row),
        dup.reason === "in_file" ? "duplicate_in_file" : "duplicate_existing",
        dup.field,
        dup.value,
        dup.reason === "in_file"
          ? "Duplicate row in this file"
          : `Matches existing lead${dup.existing_lead_name ? `: ${dup.existing_lead_name}` : ""}`,
        dup.existing_lead_id ?? "",
        dup.existing_lead_name ?? "",
      ]);
    }
    for (const warn of importResult.warnings) {
      rows.push([
        String(warn.row),
        "warning",
        warn.field,
        "",
        warn.message,
        "",
        "",
      ]);
    }
    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
              return `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `provider-leads-import-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [importResult]);

  const handleExport = useCallback(async () => {
    try {
      setExporting(true);
      const p = new URLSearchParams();
      if (stage !== "all") p.set("stage", stage);
      if (search) p.set("search", search);
      if (country) p.set("country", country);
      if (province) p.set("province", province);
      categoryIds.forEach((id) => p.append("category_ids", id));
      if (assignedToFilter) p.set("assigned_to", assignedToFilter);
      if (deletedView) p.set("deleted", "only");
      const res = await fetch(`/api/admin/provider-ops/leads/export?${p}`, { credentials: "include" });
      if (!res.ok) {
        adminToast.error("Export failed — please try again");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `provider-leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [stage, search, country, province, categoryKey, categoryIds, assignedToFilter, deletedView]);

  const handleResizeMouseDown = useCallback(() => {
    resizingRef.current = true;
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const fromRight = window.innerWidth - e.clientX;
      const maxUsable = Math.min(800, window.innerWidth - 280);
      setDetailPanelWidth(Math.max(360, Math.min(maxUsable, fromRight)));
    };
    const onMouseUp = () => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  if (denied) return denied;
  if (q.isLoading) return <div className="space-y-6"><AdminPageHeader title="Lead Inbox" /><AdminPanel><AdminPageSkeleton rows={6} /></AdminPanel></div>;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const detail = (detailQ.data ?? selectedLead ?? null) as Lead | null;
  const activitiesRaw = activitiesQ.data?.data;
  const activities = Array.isArray(activitiesRaw) ? activitiesRaw : [];

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)]",
        dragOver && "ring-2 ring-inset ring-blue-300 bg-blue-50/30 rounded-xl",
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void handleImportFile(f); }}
    >
      {/* Top header */}
      <div className="flex-shrink-0 px-2 pt-1 sm:px-1">
        <AdminPageHeader
          title="Lead Inbox"
          description={`${total.toLocaleString()} leads · Manage your provider pipeline`}
          actions={
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
              <a href="/api/admin/provider-ops/leads/template?format=with-categories" download className={cn(adminToolbarButtonClass(), "min-h-11 touch-manipulation justify-center sm:justify-start")}>
                <Download className="mr-1.5 h-4 w-4 shrink-0" />Template
              </a>
              <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportFile(f); }} />
              <button type="button" disabled={importing} className={cn(adminToolbarButtonClass(importing), "min-h-11 touch-manipulation justify-center sm:justify-start")} onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-1.5 h-4 w-4 shrink-0" />{importing ? "…" : "Import"}
              </button>
              <button type="button" disabled={exporting || total === 0} className={cn(adminToolbarButtonClass(exporting || total === 0), "min-h-11 touch-manipulation justify-center sm:justify-start")} onClick={() => void handleExport()}>
                <Download className="mr-1.5 h-4 w-4 shrink-0" />Export
              </button>
              <Link to={adminSpaTo("/admin/provider-ops/leads/new")} className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors touch-manipulation sm:col-span-1">
                <Plus className="mr-1.5 h-4 w-4 shrink-0" />New Lead
              </Link>
            </div>
          }
        />
      </div>
      {(country || province || categoryIds.length > 0 || assignedToFilter) && (
        <div className="mx-1 mb-2 flex flex-wrap items-center gap-1.5">
          {assignedToFilter ? (
            <button
              type="button"
              onClick={() => {
                const n = new URLSearchParams(sp);
                n.delete("assigned_to");
                n.delete("page");
                setSp(n, { replace: true });
              }}
              className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800 ring-1 ring-slate-200"
            >
              {assignedToFilter === "unassigned"
                ? "Assignee: Unassigned"
                : `Assignee: ${assigneeFilterOptions.find((x) => x.value === assignedToFilter)?.label ?? assignedToFilter.slice(0, 8) + "…"}`}{" "}
              ×
            </button>
          ) : null}
          {country ? (
            <button
              type="button"
              onClick={() => {
                const n = new URLSearchParams(sp);
                n.delete("country");
                n.delete("province");
                n.delete("page");
                setSp(n, { replace: true });
              }}
              className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
            >
              Country: {country} ×
            </button>
          ) : null}
          {province ? (
            <button
              type="button"
              onClick={() => {
                const n = new URLSearchParams(sp);
                n.delete("province");
                n.delete("page");
                setSp(n, { replace: true });
              }}
              className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
            >
              Province: {province} ×
            </button>
          ) : null}
          {categoryIds.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                const n = new URLSearchParams(sp);
                n.delete("category_ids");
                n.delete("category_id");
                n.delete("page");
                setSp(n, { replace: true });
              }}
              className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700"
            >
              Categories: {selectedCategoryNames.join(", ")} ×
            </button>
          ) : null}
        </div>
      )}

      {importResult && (
        <div className="mx-1 mb-2 flex-shrink-0">
          <AdminPanel className={cn("!border-emerald-200 !bg-emerald-50", importResult.error && "!border-amber-200 !bg-amber-50")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold text-emerald-800">
                  {importResult.imported.toLocaleString()} leads imported
                </p>
                <p className="text-xs text-emerald-700">
                  {importResult.total_rows_in_file} rows · {importResult.skipped_empty} empty rows skipped
                  {importResult.skipped_duplicates_count > 0
                    ? ` · ${importResult.skipped_duplicates_count} duplicates skipped`
                    : ""}
                  {importResult.recovered_rows > 0
                    ? ` · ${importResult.recovered_rows} rows auto-recovered`
                    : ""}
                  {importResult.warnings.length > 0 ? ` · ${importResult.warnings.length} warning(s)` : ""}
                </p>
                {importResult.error ? (
                  <p className="text-xs text-amber-700">{importResult.error}</p>
                ) : null}
                {(importResult.warnings.length > 0 || importResult.skipped_duplicates_count > 0) && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setImportDetailsOpen((open) => !open)}
                      className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
                    >
                      {importDetailsOpen ? "Hide details" : "Show details"}
                    </button>
                    {importDetailsOpen ? (
                      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-emerald-800">
                        {importResult.skipped_duplicates.slice(0, 50).map((dup, idx) => (
                          <li key={`dup-${dup.row}-${idx}`}>
                            Row {dup.row}: duplicate {dup.field} ({dup.value})
                            {dup.existing_lead_name ? ` — matches ${dup.existing_lead_name}` : ""}
                          </li>
                        ))}
                        {importResult.warnings.slice(0, 50).map((warn, idx) => (
                          <li key={`warn-${warn.row}-${idx}`}>
                            Row {warn.row}: {warn.field} — {warn.message}
                          </li>
                        ))}
                        {importResult.skipped_duplicates.length + importResult.warnings.length > 50 ? (
                          <li className="text-emerald-600">…and more. Download the full report.</li>
                        ) : null}
                      </ul>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {(importResult.warnings.length > 0 || importResult.skipped_duplicates_count > 0) && (
                  <button
                    type="button"
                    onClick={downloadImportReport}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-900"
                  >
                    Download report
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setImportResult(null);
                    setImportDetailsOpen(false);
                  }}
                  className="text-xs text-emerald-600 hover:text-emerald-800"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </AdminPanel>
        </div>
      )}

      {/* Stage tabs — horizontal scroll on narrow screens */}
      <div className="flex-shrink-0 overflow-x-auto overscroll-x-contain px-2 pb-3 [-webkit-overflow-scrolling:touch] sm:px-1">
        <div className="flex w-max min-w-full items-center gap-1.5 pb-0.5 sm:w-auto sm:flex-wrap">
          {STAGES.map((s) => (
            <button key={s} type="button" className={cn(adminTabButtonClass(stage === s), "touch-manipulation whitespace-nowrap")} onClick={() => setStage(s)}>
              {s !== "all" && <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full", STAGE_DOT[s])} />}
              {STAGE_LABELS[s]}
              {stageCounts[s] != null && <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">{stageCounts[s]}</span>}
            </button>
          ))}
          <button
            type="button"
            className={cn(adminTabButtonClass(deletedView), "touch-manipulation whitespace-nowrap")}
            onClick={() => {
              const n = new URLSearchParams(sp);
              if (deletedView) n.delete("deleted");
              else n.set("deleted", "only");
              n.set("page", "1");
              setSp(n, { replace: true });
            }}
          >
            <Trash2 className="mr-1 inline h-3.5 w-3.5" />
            Trash
          </button>
        </div>
      </div>

      <LeadStageGuide />

      {/* Toolbar: search + filters + view toggle + bulk actions */}
      <div className="flex-shrink-0 px-2 pb-3 sm:px-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex w-full gap-2 sm:max-w-md sm:flex-1">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                enterKeyHint="search"
                placeholder="Search name, email, phone…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && commitSearch()}
                className="w-full min-h-11 rounded-xl border border-gray-300 bg-white py-2.5 pl-9 pr-4 text-base sm:text-sm placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
              />
            </div>
            <button type="button" className="min-h-11 shrink-0 touch-manipulation rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800" onClick={commitSearch}>Search</button>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <button type="button" onClick={() => setFiltersOpen(!filtersOpen)} className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors touch-manipulation", filtersOpen ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50")}>
              <Filter className="h-4 w-4" />Filters{filtersOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {selectedIds.size > 0 && (
              <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm sm:flex sm:flex-initial">
                <span className="shrink-0 font-medium text-blue-700">{selectedIds.size} selected</span>
                <select
                  className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs text-blue-700 sm:flex-initial"
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const nextStage = e.target.value;
                    selectedIds.forEach((id) => {
                      const row = rows.find((r) => r.id === id);
                      stageChangeMut.mutate({ id, newStage: nextStage, expected_updated_at: row?.updated_at });
                    });
                    setSelectedIds(new Set());
                    e.target.value = "";
                  }}
                >
                  <option value="">Bulk stage…</option>
                  {STAGES.filter((s) => s !== "all").map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                </select>
                <button
                  type="button"
                  disabled={bulkDeleteMut.isPending}
                  onClick={confirmBulkDelete}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  title="Delete selected leads"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
                <button type="button" onClick={() => setSelectedIds(new Set())} className="shrink-0 text-blue-500 hover:text-blue-700"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            <div className="inline-flex rounded-xl border border-gray-300 bg-white">
              <button
                type="button"
                onClick={() => setLeadDensity("comfortable")}
                className={cn(
                  "min-h-11 touch-manipulation rounded-l-xl px-3 text-xs font-medium",
                  density === "comfortable" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50",
                )}
              >
                Cozy
              </button>
              <button
                type="button"
                onClick={() => setLeadDensity("compact")}
                className={cn(
                  "min-h-11 touch-manipulation rounded-r-xl px-3 text-xs font-medium",
                  density === "compact" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50",
                )}
              >
                Compact
              </button>
            </div>
            <div className="ml-auto flex shrink-0 rounded-xl border border-gray-300 bg-white sm:ml-0">
              <button type="button" onClick={() => setLeadView("table")} className={cn("min-h-11 min-w-11 touch-manipulation rounded-l-xl px-2.5 py-2 transition-colors", viewMode === "table" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50")} aria-label="Table view">
                <LayoutList className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setLeadView("card")} className={cn("min-h-11 min-w-11 touch-manipulation rounded-r-xl px-2.5 py-2 transition-colors", viewMode === "card" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50")} aria-label="Card view">
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {filtersOpen && (
          <div className="mt-2 hidden flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 md:flex">
            <select
              value={country}
              onChange={(e) => { const n = new URLSearchParams(sp); if (e.target.value) n.set("country", e.target.value); else n.delete("country"); n.delete("page"); setSp(n, { replace: true }); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="">All Countries</option>
              {countryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({opt.count})
                </option>
              ))}
            </select>
            <select
              value={province}
              onChange={(e) => { const n = new URLSearchParams(sp); if (e.target.value) n.set("province", e.target.value); else n.delete("province"); n.delete("page"); setSp(n, { replace: true }); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="">All Provinces / States</option>
              {provinceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({opt.count})
                </option>
              ))}
            </select>
            <select
              value={assignedToFilter}
              onChange={(e) => {
                const n = new URLSearchParams(sp);
                if (e.target.value) n.set("assigned_to", e.target.value);
                else n.delete("assigned_to");
                n.delete("page");
                setSp(n, { replace: true });
              }}
              className="min-w-[200px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="">All assignees</option>
              <option value="unassigned">Unassigned</option>
              {assigneeFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({opt.count})
                </option>
              ))}
            </select>
            <div className="min-w-[240px] rounded-lg border border-gray-300 bg-white p-2">
              <div className="mb-1 text-xs font-medium text-gray-600">Categories</div>
              <div className="max-h-44 space-y-1 overflow-auto pr-1">
                {categoryOptions.map((cat) => {
                  const checked = categoryIds.includes(cat.id);
                  return (
                    <label key={cat.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-gray-700 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const n = new URLSearchParams(sp);
                          const next = new Set(categoryIds);
                          if (e.target.checked) next.add(cat.id);
                          else next.delete(cat.id);
                          n.delete("category_id");
                          n.delete("category_ids");
                          [...next].forEach((id) => n.append("category_ids", id));
                          n.delete("page");
                          setSp(n, { replace: true });
                        }}
                      />
                      <span className="flex-1 truncate">{cat.name}</span>
                      <span className="text-xs text-gray-400">{cat.count}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            {(country || province || categoryIds.length > 0 || assignedToFilter) && (
              <button type="button" onClick={() => { const n = new URLSearchParams(sp); n.delete("country"); n.delete("province"); n.delete("category_id"); n.delete("category_ids"); n.delete("assigned_to"); n.delete("page"); setSp(n, { replace: true }); }} className="text-xs text-gray-500 hover:text-gray-700 underline">Clear filters</button>
            )}
          </div>
        )}
      </div>

      {filtersOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[105] flex items-end bg-black/40 p-0 md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Lead filters"
            onClick={(e) => {
              if (e.target === e.currentTarget) setFiltersOpen(false);
            }}
          >
            <div className="max-h-[88dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Filter leads</h2>
                  <p className="text-xs text-gray-500">Refine the inbox without losing your place.</p>
                </div>
                <button type="button" onClick={() => setFiltersOpen(false)} className="min-h-11 min-w-11 rounded-xl p-2 text-gray-500 hover:bg-gray-100" aria-label="Close filters">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3">
                <select
                  value={country}
                  onChange={(e) => { const n = new URLSearchParams(sp); if (e.target.value) n.set("country", e.target.value); else n.delete("country"); n.delete("province"); n.delete("page"); setSp(n, { replace: true }); }}
                  className="min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-base text-gray-700"
                >
                  <option value="">All Countries</option>
                  {countryOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label} ({opt.count})</option>)}
                </select>
                <select
                  value={province}
                  onChange={(e) => { const n = new URLSearchParams(sp); if (e.target.value) n.set("province", e.target.value); else n.delete("province"); n.delete("page"); setSp(n, { replace: true }); }}
                  className="min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-base text-gray-700"
                >
                  <option value="">All Provinces / States</option>
                  {provinceOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label} ({opt.count})</option>)}
                </select>
                <select
                  value={assignedToFilter}
                  onChange={(e) => {
                    const n = new URLSearchParams(sp);
                    if (e.target.value) n.set("assigned_to", e.target.value);
                    else n.delete("assigned_to");
                    n.delete("page");
                    setSp(n, { replace: true });
                  }}
                  className="min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-base text-gray-700"
                >
                  <option value="">All assignees</option>
                  <option value="unassigned">Unassigned</option>
                  {assigneeFilterOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label} ({opt.count})</option>)}
                </select>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Categories</div>
                  <div className="max-h-60 space-y-1 overflow-auto">
                    {categoryOptions.map((cat) => {
                      const checked = categoryIds.includes(cat.id);
                      return (
                        <label key={cat.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-white px-2 py-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const n = new URLSearchParams(sp);
                              const next = new Set(categoryIds);
                              if (e.target.checked) next.add(cat.id);
                              else next.delete(cat.id);
                              n.delete("category_id");
                              n.delete("category_ids");
                              [...next].forEach((id) => n.append("category_ids", id));
                              n.delete("page");
                              setSp(n, { replace: true });
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate">{cat.name}</span>
                          <span className="text-xs text-gray-400">{cat.count}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { const n = new URLSearchParams(sp); n.delete("country"); n.delete("province"); n.delete("category_id"); n.delete("category_ids"); n.delete("assigned_to"); n.delete("page"); setSp(n, { replace: true }); }}
                    className="min-h-11 flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700"
                  >
                    Clear
                  </button>
                  <button type="button" onClick={() => setFiltersOpen(false)} className="min-h-11 flex-1 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white">
                    Show leads
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Main split-panel area — min-h-0 so flex children can shrink and the drawer gets a real height */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left panel: lead list */}
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-col overflow-hidden border-gray-200 lg:border-r",
            selectedLeadId ? "flex-1" : "w-full",
          )}
        >
          {rows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyState title="No leads found" description="Try adjusting your filters or create a new lead." />
            </div>
          ) : viewMode === "table" ? (
            <LeadTable
              rows={rows}
              selectedLeadId={selectedLeadId}
              selectedIds={selectedIds}
              sortBy={sortBy}
              sortDir={sortDir}
              onSelectLead={setSelectedLeadId}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onSort={toggleSort}
              onStageChange={(id, s, expectedAt) => stageChangeMut.mutate({ id, newStage: s, expected_updated_at: expectedAt })}
              onWhatsAppClick={(lead) => setWhatsAppLead(lead)}
              assignLeadMut={assignLeadMut}
              density={density}
            />
          ) : (
            <LeadCardGrid
              rows={rows}
              selectedLeadId={selectedLeadId}
              onSelectLead={setSelectedLeadId}
              assignLeadMut={assignLeadMut}
              density={density}
            />
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-100 bg-white px-4 py-2">
              <p className="text-xs text-gray-500">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}</p>
              <div className="flex gap-2">
                <button type="button" className={adminToolbarButtonClass(page <= 1)} disabled={page <= 1} onClick={() => { const n = new URLSearchParams(sp); n.set("page", String(page - 1)); setSp(n, { replace: true }); }}>Previous</button>
                <button type="button" className={adminToolbarButtonClass(!hasMore)} disabled={!hasMore} onClick={() => { const n = new URLSearchParams(sp); n.set("page", String(page + 1)); setSp(n, { replace: true }); }}>Next</button>
              </div>
            </div>
          )}
        </div>

        {/* Resize handle */}
        {selectedLeadId && (
          <div
            className="hidden w-1 flex-shrink-0 cursor-col-resize bg-gray-200 transition-colors hover:bg-gray-400 active:bg-gray-500 lg:block"
            onMouseDown={handleResizeMouseDown}
            aria-hidden
          />
        )}

        {/* Right panel: lead detail preview (desktop) */}
        {selectedLeadId && (
          <div
            className="hidden min-h-0 max-w-[min(800px,calc(100vw-14rem))] shrink-0 overflow-hidden bg-white lg:flex lg:flex-col lg:self-stretch"
            style={{ width: detailPanelWidth }}
          >
            <DetailPanel
              lead={detail}
              activities={activities}
              isLoading={detailQ.isLoading}
              noteText={noteText}
              setNoteText={setNoteText}
              onAddNote={() => addNoteMut.mutate(selectedLeadId)}
              addingNote={addNoteMut.isPending}
              onLogCall={() => logCallMut.mutate(selectedLeadId)}
              loggingCall={logCallMut.isPending}
              onStageChange={(s) =>
                stageChangeMut.mutate({
                  id: selectedLeadId!,
                  newStage: s,
                  expected_updated_at: detail?.updated_at,
                })
              }
              onDelete={() => { if (confirm("Move this lead to trash?")) deleteMut.mutate(selectedLeadId); }}
              onRestore={() => { if (confirm("Restore this lead?")) restoreMut.mutate(selectedLeadId); }}
              onClose={() => setSelectedLeadId(null)}
              isDeleting={deleteMut.isPending}
              isRestoring={restoreMut.isPending}
              onSave={(fields) => updateLeadMut.mutate(fields)}
              isSaving={updateLeadMut.isPending}
            />
          </div>
        )}
      </div>

      {selectedLeadId &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex max-h-[100dvh] flex-col justify-end bg-black/40 pt-[env(safe-area-inset-top,0px)] lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Lead details"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedLeadId(null);
            }}
          >
            <div
              className="mx-auto flex min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl"
              style={{
                maxHeight:
                  "min(92dvh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 0.5rem))",
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
              }}
            >
              <DetailPanel
                lead={detail}
                activities={activities}
                isLoading={detailQ.isLoading}
                noteText={noteText}
                setNoteText={setNoteText}
                onAddNote={() => addNoteMut.mutate(selectedLeadId)}
                addingNote={addNoteMut.isPending}
                onLogCall={() => logCallMut.mutate(selectedLeadId)}
                loggingCall={logCallMut.isPending}
                onStageChange={(s) => stageMutateSafe(stageChangeMut, selectedLeadId, s, detail?.updated_at)}
                onDelete={() => {
                  if (confirm("Move this lead to trash?")) deleteMut.mutate(selectedLeadId);
                }}
                onRestore={() => {
                  if (confirm("Restore this lead?")) restoreMut.mutate(selectedLeadId);
                }}
                onClose={() => setSelectedLeadId(null)}
                isDeleting={deleteMut.isPending}
                isRestoring={restoreMut.isPending}
                onSave={(fields) => updateLeadMut.mutate(fields)}
                isSaving={updateLeadMut.isPending}
              />
            </div>
          </div>,
          document.body,
        )}

      {/* Floating action bar for bulk selection */}
      {bulkAssignOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Bulk assign leads"
          onClick={() => setBulkAssignOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
            <AssigneeSearchPanel
              title={`Assign ${selectedIds.size} lead(s) to…`}
              onClose={() => setBulkAssignOpen(false)}
              onPick={(user) => void runBulkAssign(user)}
            />
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-2xl bg-gray-900 px-4 py-3 text-white shadow-2xl transition-all sm:gap-4 sm:px-6">
          <span className="text-sm font-medium">{selectedIds.size} leads selected</span>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            onClick={() => setBulkAssignOpen(true)}
          >
            <UserPlus className="h-4 w-4" /> Assign to…
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            onClick={() => setShowBulkWhatsApp(true)}
          >
            <MessageCircle className="h-4 w-4" /> Send WhatsApp
          </button>
          <button
            type="button"
            disabled={bulkDeleteMut.isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-red-400/80 bg-red-600/90 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
            onClick={confirmBulkDelete}
          >
            <Trash2 className="h-4 w-4" />
            {bulkDeleteMut.isPending ? "Deleting…" : "Delete selected"}
          </button>
          <button
            className="text-sm text-gray-400 hover:text-white"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {/* WhatsApp send modal */}
      {whatsAppLead && (
        <WhatsAppSendModal
          open={Boolean(whatsAppLead)}
          onClose={() => setWhatsAppLead(null)}
          lead={whatsAppLead}
        />
      )}

      {/* Bulk WhatsApp modal */}
      <BulkWhatsAppModal
        open={showBulkWhatsApp}
        onClose={() => setShowBulkWhatsApp(false)}
        leads={rows.filter((r) => selectedIds.has(r.id))}
      />
    </div>
  );
}

function stageMutateSafe(
  stageMut: {
    mutate: (args: { id: string; newStage: string; expected_updated_at?: string }) => void;
  },
  id: string,
  newStage: string,
  expectedUpdatedAt?: string,
) {
  stageMut.mutate({ id, newStage, expected_updated_at: expectedUpdatedAt });
}

function LeadStageGuide() {
  return (
    <AdminPanel className="mx-2 mb-3 !border-blue-100 !bg-blue-50/40 px-4 py-3 sm:mx-1">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Lead stage flow</p>
          <p className="mt-1 text-xs leading-relaxed text-blue-700/80">
            Work the main path left to right. Use Lost or Nurture as branch outcomes; Matched means the lead is linked to a provider account.
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 lg:justify-end">
          {LEAD_STAGE_PRIMARY_FLOW.map((stageKey, index) => (
            <div key={stageKey} className="flex items-center gap-1.5">
              <span
                title={`${LEAD_STAGE_DESCRIPTIONS[stageKey]} Next: ${getLeadStageNextAction(stageKey)}`}
                className="inline-flex items-center gap-1 rounded-full border border-white/80 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 shadow-sm"
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", STAGE_DOT[stageKey])} />
                {STAGE_LABELS[stageKey]}
              </span>
              {index < LEAD_STAGE_PRIMARY_FLOW.length - 1 ? (
                <ArrowRight className="h-3 w-3 text-blue-300" aria-hidden />
              ) : null}
            </div>
          ))}
          <span className="mx-1 hidden h-4 w-px bg-blue-200 sm:inline-block" />
          {LEAD_STAGE_BRANCHES.map((stageKey) => (
            <span
              key={stageKey}
              title={`${LEAD_STAGE_DESCRIPTIONS[stageKey]} Next: ${getLeadStageNextAction(stageKey)}`}
              className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-white/70 px-2 py-1 text-[11px] font-medium text-gray-600"
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", STAGE_DOT[stageKey])} />
              Branch: {STAGE_LABELS[stageKey]}
            </span>
          ))}
        </div>
      </div>
    </AdminPanel>
  );
}

// ─── Table view ───────────────────────────────────────────────────────────────

function SortHeader({ label, column, sortBy, sortDir, onSort }: { label: string; column: string; sortBy: string; sortDir: string; onSort: (c: string) => void }) {
  const active = sortBy === column;
  return (
    <button type="button" onClick={() => onSort(column)} className="group inline-flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-900">
      {label}
      <ArrowUpDown className={cn("h-3 w-3 transition-colors", active ? "text-gray-900" : "text-gray-300 group-hover:text-gray-500")} />
      {active && <span className="text-[9px] text-gray-400">{sortDir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

function LeadTable({ rows, selectedLeadId, selectedIds, sortBy, sortDir, onSelectLead, onToggleSelect, onToggleSelectAll, onSort, onStageChange, onWhatsAppClick, assignLeadMut, density }: {
  rows: Lead[];
  selectedLeadId: string | null;
  selectedIds: Set<string>;
  sortBy: string;
  sortDir: string;
  onSelectLead: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onSort: (col: string) => void;
  onStageChange: (id: string, stage: string, expectedUpdatedAt?: string) => void;
  onWhatsAppClick?: (lead: Lead) => void;
  assignLeadMut: {
    mutate: (args: { leadId: string; assigned_to: string; assigned_to_name?: string; expected_updated_at?: string }) => void;
    isPending: boolean;
    variables?: { leadId: string; assigned_to: string; assigned_to_name?: string; expected_updated_at?: string };
  };
  density?: "comfortable" | "compact";
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const rowPad = density === "compact" ? "py-1.5" : "py-2.5";

  return (
    <div className="flex-1 overflow-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
      <table className="w-full min-w-[640px]">
        <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm">
          <tr className="border-b border-gray-200">
            <th className="w-10 px-3 py-3">
              <button type="button" onClick={onToggleSelectAll} className="text-gray-400 hover:text-gray-700">
                {selectedIds.size === rows.length && rows.length > 0 ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
              </button>
            </th>
            <th className="px-3 py-3 text-left"><SortHeader label="Name" column="contact_person_name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /></th>
            <th className="px-3 py-3 text-left"><SortHeader label="Stage" column="commercial_stage" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /></th>
            <th className="hidden px-3 py-3 text-left lg:table-cell">Assignee</th>
            <th className="hidden px-3 py-3 text-left md:table-cell"><SortHeader label="Source" column="source" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /></th>
            <th className="hidden px-3 py-3 text-left lg:table-cell">Category</th>
            <th className="hidden px-3 py-3 text-left xl:table-cell">Location</th>
            <th className="px-3 py-3 text-left"><SortHeader label="Created" column="created_at" sortBy={sortBy} sortDir={sortDir} onSort={onSort} /></th>
            <th className="w-12 px-3 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((lead) => {
            const name = lead.business_name || lead.contact_person_name || "Unnamed Lead";
            const badge = STAGE_BADGE[lead.commercial_stage] || "bg-gray-100 text-gray-600 ring-gray-600/20";
            const cats = asLeadCategoryList(lead.provider_lead_categories)
              .map((c) => c.global_service_categories?.name)
              .filter(Boolean);
            const isSelected = lead.id === selectedLeadId;
            const isChecked = selectedIds.has(lead.id);
            const isHovered = hoveredId === lead.id;

            return (
              <tr
                key={lead.id}
                className={cn(
                  "group cursor-pointer transition-colors",
                  isSelected ? "bg-blue-50/80" : "hover:bg-gray-50/80",
                )}
                onClick={() => onSelectLead(lead.id)}
                onMouseEnter={() => setHoveredId(lead.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <td className={cn("px-3", rowPad)} onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => onToggleSelect(lead.id)} className="text-gray-400 hover:text-gray-700">
                    {isChecked ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                  </button>
                </td>
                <td className={cn("px-3", rowPad)}>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{name}</p>
                        {lead.phone_e164 && (
                          <WhatsAppStatusChip status={lead.whatsapp_status} compact />
                        )}
                      </div>
                      {lead.email && <p className="truncate text-xs text-gray-400">{lead.email}</p>}
                    </div>
                  </div>
                </td>
                <td className={cn("px-3", rowPad)}>
                  {/* Touch: always show stage control (no hover). Desktop: badge until row hover */}
                  <div className="md:hidden">
                    <select
                      value={lead.commercial_stage}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { e.stopPropagation(); onStageChange(lead.id, e.target.value, lead.updated_at); }}
                      className="min-h-11 max-w-[9rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 touch-manipulation sm:max-w-full"
                    >
                      {STAGES.filter((s) => s !== "all").map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                    </select>
                  </div>
                  <div className="hidden md:block">
                    {isHovered ? (
                      <select
                        value={lead.commercial_stage}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); onStageChange(lead.id, e.target.value, lead.updated_at); }}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700"
                      >
                        {STAGES.filter((s) => s !== "all").map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                      </select>
                    ) : (
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", badge)}>
                        {getLeadStageLabel(lead.commercial_stage)}
                      </span>
                    )}
                  </div>
                </td>
                <td className={cn("hidden px-3 lg:table-cell", rowPad)} onClick={(e) => e.stopPropagation()}>
                  <LeadAssigneeInline
                    leadId={lead.id}
                    assignedToId={lead.assigned_to ?? null}
                    displayName={assigneeDisplayName(lead)}
                    updatedAt={lead.updated_at}
                    onAssign={(args) => assignLeadMut.mutate(args)}
                    disabled={assignLeadMut.isPending && assignLeadMut.variables?.leadId === lead.id}
                  />
                </td>
                <td className={cn("hidden px-3 md:table-cell", rowPad)}>
                  <span className="inline-block rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">{lead.source}</span>
                </td>
                <td className={cn("hidden px-3 lg:table-cell", rowPad)}>
                  <div className="flex flex-wrap gap-1">
                    {cats.slice(0, 2).map((c) => (
                      <span key={c} className="inline-block rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">{c}</span>
                    ))}
                    {cats.length > 2 && <span className="text-[10px] text-gray-400">+{cats.length - 2}</span>}
                  </div>
                </td>
                <td className={cn("hidden px-3 xl:table-cell", rowPad)}>
                  {lead.suggested_location_text && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <MapPin className="h-3 w-3" />{lead.suggested_location_text}
                    </span>
                  )}
                </td>
                <td className={cn("px-3", rowPad)}>
                  <span className="text-xs text-gray-500">{new Date(lead.created_at).toLocaleDateString()}</span>
                </td>
                <td className={cn("px-3", rowPad)} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                      {lead.phone_e164 && (
                        <a href={`tel:${lead.phone_e164}`} className="min-h-9 min-w-9 touch-manipulation rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Call">
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {lead.phone_e164 && (
                        <button
                          type="button"
                          className="min-h-9 min-w-9 touch-manipulation rounded-md p-1.5 text-green-500 hover:bg-green-50 hover:text-green-700"
                          title="WhatsApp"
                          onClick={() => onWhatsAppClick?.(lead)}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {lead.email && (
                        <a href={`mailto:${lead.email}`} className="min-h-9 min-w-9 touch-manipulation rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Email">
                          <Mail className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <Link to={adminSpaTo(`/admin/provider-ops/leads/${lead.id}`)} className="min-h-9 min-w-9 touch-manipulation rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Full page">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Card grid view ───────────────────────────────────────────────────────────

function LeadCardGrid({ rows, selectedLeadId, onSelectLead, assignLeadMut, density }: {
  rows: Lead[];
  selectedLeadId: string | null;
  onSelectLead: (id: string) => void;
  assignLeadMut: {
    mutate: (args: { leadId: string; assigned_to: string; assigned_to_name?: string; expected_updated_at?: string }) => void;
    isPending: boolean;
    variables?: { leadId: string; assigned_to: string; assigned_to_name?: string; expected_updated_at?: string };
  };
  density?: "comfortable" | "compact";
}) {
  return (
    <div className="flex-1 overflow-auto p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((lead) => {
          const name = lead.business_name || lead.contact_person_name || "Unnamed Lead";
          const badge = STAGE_BADGE[lead.commercial_stage] || "bg-gray-100 text-gray-600 ring-gray-600/20";
          const cats = asLeadCategoryList(lead.provider_lead_categories)
            .map((c) => c.global_service_categories?.name)
            .filter(Boolean);
          const tagCount = asLeadTagList(lead.tags).length;
          const isSelected = lead.id === selectedLeadId;

          return (
            <button
              key={lead.id}
              type="button"
              onClick={() => onSelectLead(lead.id)}
              className={cn(
                "w-full rounded-xl border bg-white text-left transition-all hover:shadow-md",
                density === "compact" ? "p-3" : "p-4",
                isSelected ? "border-blue-300 ring-2 ring-blue-100 shadow-md" : "border-gray-200",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
                    <span className={cn("mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", badge)}>
                      {getLeadStageLabel(lead.commercial_stage)}
                    </span>
                    {(lead.overdue_task_count ?? 0) > 0 ? (
                      <span className="ml-1 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        {lead.overdue_task_count} overdue
                      </span>
                    ) : null}
                  </div>
                </div>
                <span className="inline-block rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{lead.source}</span>
              </div>
              <div className="mt-3 space-y-1 text-xs text-gray-500">
                {lead.email && <div className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 flex-shrink-0 text-gray-400" />{lead.email}</div>}
                {lead.phone_e164 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Phone className="h-3 w-3 flex-shrink-0 text-gray-400" />
                    <span>{lead.phone_e164}</span>
                    <WhatsAppStatusChip status={lead.whatsapp_status} compact />
                  </div>
                )}
                {lead.suggested_location_text && <div className="flex items-center gap-1.5 truncate"><MapPin className="h-3 w-3 flex-shrink-0 text-gray-400" />{lead.suggested_location_text}</div>}
              </div>
              {cats.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {cats.map((c) => <span key={c} className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">{c}</span>)}
                </div>
              )}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-400" onClick={(e) => e.stopPropagation()}>
                <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:justify-start">
                  <span className="text-gray-500">Owner</span>
                  <LeadAssigneeInline
                    leadId={lead.id}
                    assignedToId={lead.assigned_to ?? null}
                    displayName={assigneeDisplayName(lead)}
                    updatedAt={lead.updated_at}
                    onAssign={(args) => assignLeadMut.mutate(args)}
                    disabled={assignLeadMut.isPending && assignLeadMut.variables?.leadId === lead.id}
                    compact
                  />
                </div>
                <span>{new Date(lead.created_at).toLocaleDateString()}</span>
                {tagCount > 0 && (
                  <span className="flex items-center gap-0.5"><Tag className="h-2.5 w-2.5" />{tagCount}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Detail panel (right side) ────────────────────────────────────────────────

function DetailPanel({ lead, activities, isLoading, noteText, setNoteText, onAddNote, addingNote, onLogCall, loggingCall, onStageChange, onDelete, onRestore, onClose, isDeleting, isRestoring, onSave, isSaving }: {
  lead: Lead | null;
  activities: Activity[];
  isLoading: boolean;
  noteText: string;
  setNoteText: (v: string) => void;
  onAddNote: () => void;
  addingNote: boolean;
  onLogCall: () => void;
  loggingCall: boolean;
  onStageChange: (stage: string) => void;
  onDelete: () => void;
  onRestore?: () => void;
  onClose: () => void;
  isDeleting: boolean;
  isRestoring?: boolean;
  onSave?: (fields: Record<string, unknown>) => void;
  isSaving?: boolean;
}) {
  const qc = useQueryClient();
  const leadId = lead?.id;
  const [activityTab, setActivityTab] = useState<DetailActivityTab>("timeline");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    business_name: "",
    contact_person_name: "",
    email: "",
    phone_e164: "",
    suggested_location_text: "",
    description: "",
    notes: "",
  });

  const tasksQ = useQuery({
    queryKey: [...adminQueryKeys.providerOps.leadDetail(leadId!), "tasks"],
    queryFn: () =>
      adminApi.getJson<{
        tasks: Array<{
          id: string;
          title: string;
          description: string | null;
          due_at: string | null;
          completed_at: string | null;
          assigned_to: string | null;
          assignee?: { full_name?: string | null; email?: string | null } | null;
        }>;
      }>(`/api/admin/provider-ops/leads/${leadId}/tasks`),
    enabled: !!leadId && activityTab === "tasks",
  });

  const commsQ = useQuery({
    queryKey: [...adminQueryKeys.providerOps.leadDetail(leadId!), "communications"],
    queryFn: () =>
      adminApi.getJson<{
        communications: Array<{
          id: string;
          channel: string;
          direction: string;
          status: string | null;
          subject: string | null;
          body: string | null;
          created_at: string;
        }>;
      }>(`/api/admin/provider-ops/leads/${leadId}/communications?limit=20`),
    enabled: !!leadId && activityTab === "comms",
  });

  const createTaskMut = useMutation({
    mutationFn: () =>
      adminApi.postJson(`/api/admin/provider-ops/leads/${leadId}/tasks`, {
        title: taskTitle.trim(),
        due_at: taskDueAt ? new Date(taskDueAt).toISOString() : null,
      }),
    onSuccess: () => {
      adminToast.success("Task created");
      setTaskTitle("");
      setTaskDueAt("");
      void tasksQ.refetch();
      if (leadId) void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(leadId) });
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to create task"),
  });

  const completeTaskMut = useMutation({
    mutationFn: (taskId: string) =>
      adminApi.patchJson(`/api/admin/provider-ops/leads/${leadId}/tasks/${taskId}`, { completed: true }),
    onSuccess: () => {
      void tasksQ.refetch();
      if (leadId) void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(leadId) });
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to complete task"),
  });

  useEffect(() => {
    setActivityTab("timeline");
    setTaskTitle("");
    setTaskDueAt("");
  }, [leadId]);

  if (isLoading || !lead) {
    return (
      <div className="flex min-h-[min(50vh,20rem)] flex-1 items-center justify-center p-8">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
          <p className="text-sm text-gray-500">Loading lead details…</p>
        </div>
      </div>
    );
  }

  const l = lead;

  const name = l.business_name || l.contact_person_name || "Unnamed Lead";
  const tagList = asLeadTagList(l.tags);
  const cats = asLeadCategoryList(l.provider_lead_categories).map((c) => c.global_service_categories).filter(Boolean);

  function startEditing() {
    setEditFields({
      business_name: l.business_name || "",
      contact_person_name: l.contact_person_name || "",
      email: l.email || "",
      phone_e164: l.phone_e164 || "",
      suggested_location_text: l.suggested_location_text || "",
      description: l.description || "",
      notes: l.notes || "",
    });
    setEditing(true);
  }

  function handleSave() {
    if (!onSave) return;
    const updates: Record<string, unknown> = {};
    if (editFields.business_name !== (l.business_name || "")) updates.business_name = editFields.business_name || null;
    if (editFields.contact_person_name !== (l.contact_person_name || "")) updates.contact_person_name = editFields.contact_person_name || null;
    if (editFields.email !== (l.email || "")) updates.email = editFields.email || null;
    if (editFields.phone_e164 !== (l.phone_e164 || "")) updates.phone_e164 = editFields.phone_e164 || null;
    if (editFields.suggested_location_text !== (l.suggested_location_text || "")) updates.suggested_location_text = editFields.suggested_location_text || null;
    if (editFields.description !== (l.description || "")) updates.description = editFields.description || null;
    if (editFields.notes !== (l.notes || "")) updates.notes = editFields.notes || null;
    if (Object.keys(updates).length === 0) {
      setEditing(false);
      return;
    }
    onSave(updates);
    setEditing(false);
  }

  return (
    <div className="flex h-full min-h-0 max-h-full flex-col">
      <div className="flex justify-center py-1.5 lg:hidden">
        <div className="h-1 w-10 rounded-full bg-gray-300" />
      </div>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white">
              {name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-gray-900">{name}</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", STAGE_BADGE[lead.commercial_stage] || "bg-gray-100 text-gray-600")}>
                  {getLeadStageLabel(lead.commercial_stage)}
                </span>
                <DoNotContactChip
                  active={Boolean(l.do_not_contact)}
                  compact
                  onToggle={onSave ? () => onSave({ do_not_contact: !l.do_not_contact }) : undefined}
                  toggling={isSaving}
                />
                <span className="inline-block rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500">{lead.source}</span>
                {(() => {
                  const invite = leadInviteStatusChip(lead);
                  return invite ? (
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", invite.className)}>
                      {invite.label}
                    </span>
                  ) : null;
                })()}
                {leadHasOnboardingData(lead) ? (
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200/80">
                    Onboarding data
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 min-w-11 shrink-0 touch-manipulation rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close details">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick actions */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {lead.phone_e164 && (
            <a href={`tel:${lead.phone_e164}`} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 touch-manipulation hover:bg-gray-50">
              <Phone className="h-3 w-3" />Call
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 touch-manipulation hover:bg-gray-50">
              <Mail className="h-3 w-3" />Email
            </a>
          )}
          {!editing && onSave && (
            <button type="button" onClick={startEditing} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 touch-manipulation hover:bg-blue-50">
              <Pencil className="h-3 w-3" />Edit
            </button>
          )}
          <Link to={adminSpaTo(`/admin/provider-ops/leads/${lead.id}`)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 touch-manipulation hover:bg-gray-50">
            <ExternalLink className="h-3 w-3" />Full Page
          </Link>
          {lead.deleted_at && onRestore ? (
            <button type="button" disabled={isRestoring} onClick={onRestore} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-700 touch-manipulation hover:bg-emerald-50 disabled:opacity-50">
              <RotateCcw className="h-3 w-3" />Restore
            </button>
          ) : !lead.deleted_at ? (
            <button type="button" disabled={isDeleting} onClick={onDelete} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 touch-manipulation hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="h-3 w-3" />Trash
            </button>
          ) : null}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        {/* Stage selector */}
        <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Stage</label>
          <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-0.5 [-webkit-overflow-scrolling:touch] sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
          <div className="flex w-max max-w-none flex-nowrap gap-1 sm:w-auto sm:flex-wrap">
            {STAGES.filter((s) => s !== "all").map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onStageChange(s)}
                className={cn(
                  "touch-manipulation whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:py-1",
                  s === lead.commercial_stage ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", STAGE_DOT[s])} />
                {STAGE_LABELS[s]}
              </button>
            ))}
          </div>
          </div>
        </div>

        {/* Inline edit form */}
        {editing ? (
          <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Edit Lead</label>
            <div className="space-y-3">
              <EditField label="Business Name" value={editFields.business_name} onChange={(v) => setEditFields((p) => ({ ...p, business_name: v }))} />
              <EditField label="Contact Person" value={editFields.contact_person_name} onChange={(v) => setEditFields((p) => ({ ...p, contact_person_name: v }))} />
              <EditField label="Email" value={editFields.email} onChange={(v) => setEditFields((p) => ({ ...p, email: v }))} type="email" />
              <EditField label="Phone" value={editFields.phone_e164} onChange={(v) => setEditFields((p) => ({ ...p, phone_e164: v }))} type="tel" />
              <EditField label="Location" value={editFields.suggested_location_text} onChange={(v) => setEditFields((p) => ({ ...p, suggested_location_text: v }))} />
              <div>
                <span className="mb-1 block text-[10px] text-gray-500">Description</span>
                <textarea
                  value={editFields.description}
                  onChange={(e) => setEditFields((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
                />
              </div>
              <div>
                <span className="mb-1 block text-[10px] text-gray-500">Notes</span>
                <textarea
                  value={editFields.notes}
                  onChange={(e) => setEditFields((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" disabled={isSaving} onClick={handleSave} className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors">
                  {isSaving ? "Saving…" : "Save Changes"}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
        {/* Contact info */}
        <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
          <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Contact</label>
          <div className="space-y-2">
            {lead.contact_person_name && <InfoRow icon={User} label="Contact Person" value={lead.contact_person_name} />}
            {lead.business_name && <InfoRow icon={User} label="Business Name" value={lead.business_name} />}
            <InfoRow icon={Mail} label="Email" value={lead.email} href={lead.email ? `mailto:${lead.email}` : undefined} />
            <InfoRow icon={Phone} label="Phone" value={lead.phone_e164} href={lead.phone_e164 ? `tel:${lead.phone_e164}` : undefined} />
            {lead.phone_e164 && (
              <div className="ml-7 mt-2">
                <LeadVoiceDialer
                  leadId={lead.id}
                  phoneE164={lead.phone_e164}
                  tenantId={l.tenant_id}
                  doNotContact={Boolean(l.do_not_contact)}
                  phoneLookupStatus={l.phone_lookup_status}
                />
              </div>
            )}
            {lead.phone_e164 && (
              <div className="ml-7 -mt-1 flex flex-wrap items-center gap-2">
                <WhatsAppStatusChip status={lead.whatsapp_status} />
                <DoNotContactChip
                  active={Boolean(l.do_not_contact)}
                  onToggle={onSave ? () => onSave({ do_not_contact: !l.do_not_contact }) : undefined}
                  toggling={isSaving}
                />
                {lead.whatsapp_checked_at && (
                  <span className="text-[11px] text-gray-400">
                    checked {new Date(lead.whatsapp_checked_at).toLocaleDateString()}
                  </span>
                )}
                {l.do_not_contact && l.do_not_contact_at && (
                  <span className="text-[11px] text-rose-600">
                    DNC since {new Date(String(l.do_not_contact_at)).toLocaleDateString()}
                  </span>
                )}
              </div>
            )}
            <InfoRow icon={MapPin} label="Location" value={lead.suggested_location_text} />
            <InfoRow icon={Calendar} label="Created" value={new Date(lead.created_at).toLocaleString()} />
            <InfoRow
              icon={UserPlus}
              label="Assigned to"
              value={lead.assigned_to ? assigneeDisplayName(lead as Lead) : "Unassigned"}
            />
            <InfoRow icon={ExternalLink} label="Source" value={lead.source} />
            {lead.country && <InfoRow icon={MapPin} label="Country" value={lead.country} />}
          </div>
        </div>

        {/* Categories */}
        {cats.length > 0 && (
          <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Categories</label>
            <div className="flex flex-wrap gap-1.5">
              {cats.map((c) => (
                <span key={c!.id} className="inline-flex items-center rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                  {c!.icon ? `${c!.icon} ` : ""}{c!.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {tagList.length > 0 && (
          <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {tagList.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  <Tag className="h-2.5 w-2.5" />{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description & Notes */}
        <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
          <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Description & Notes</label>
          {lead.description ? (
            <p className="text-sm text-gray-700 leading-relaxed">{lead.description}</p>
          ) : (
            <p className="text-sm italic text-gray-400">No description</p>
          )}
          {lead.notes ? (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm italic text-amber-800">{lead.notes}</p>
          ) : null}
        </div>
          </>
        )}

        {/* Matched provider */}
        {lead.matched_provider_id && (
          <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-xs font-semibold text-green-800">Matched Provider</p>
              <Link to={adminSpaTo(`/admin/providers/${lead.matched_provider_id}`)} className="mt-1 inline-flex items-center gap-1 text-sm text-green-700 underline">
                View Provider <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}

        {/* Activity section with tabs */}
        <div className="px-4 py-3 sm:px-5">
          <div className="mb-3 flex flex-wrap gap-1 border-b border-gray-100 pb-2">
            {([
              { key: "timeline" as const, label: "Timeline" },
              { key: "comms" as const, label: "Comms" },
              { key: "tasks" as const, label: "Tasks" },
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={cn(adminTabButtonClass(activityTab === tab.key), "touch-manipulation text-xs")}
                onClick={() => setActivityTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activityTab === "timeline" ? (
            <>
              {activities.length > 0 ? (
                <div className="relative space-y-0">
                  <div className="absolute left-3 top-3 bottom-0 w-px bg-gray-200" />
                  {activities.map((a, i) => {
                    const Icon = ACTIVITY_ICONS[a.activity_type] || ACTIVITY_ICONS.default;
                    return (
                      <div key={a.id ?? i} className="relative flex gap-3 pb-4">
                        <div className={cn(
                          "relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full",
                          a.activity_type.startsWith("stage_change") ? "bg-purple-100" :
                          a.activity_type === "note" ? "bg-blue-100" :
                          a.activity_type === "call" || a.activity_type === "call_logged" ? "bg-green-100" :
                          a.activity_type === "email" || a.activity_type === "email_sent" ? "bg-amber-100" : "bg-gray-100",
                        )}>
                          <Icon className={cn(
                            "h-3 w-3",
                            a.activity_type.startsWith("stage_change") ? "text-purple-600" :
                            a.activity_type === "note" ? "text-blue-600" :
                            a.activity_type === "call" || a.activity_type === "call_logged" ? "text-green-600" :
                            a.activity_type === "email" || a.activity_type === "email_sent" ? "text-amber-600" : "text-gray-500",
                          )} />
                        </div>
                        <div className="min-w-0 pt-0.5">
                          <p className="text-sm text-gray-700">{a.description || a.activity_type.replace(/_/g, " ")}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-400">
                            <span>{new Date(a.created_at).toLocaleString()}</span>
                            {a.created_by_name && <span>by {a.created_by_name}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No activities yet</p>
              )}

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  placeholder="Add a note or call summary…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && noteText.trim() && onAddNote()}
                  className="min-h-11 w-full flex-1 rounded-lg border border-gray-200 px-3 py-2 text-base placeholder:text-gray-400 focus:border-gray-400 focus:outline-none sm:text-sm"
                />
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={!noteText.trim() || addingNote}
                    onClick={onAddNote}
                    className="min-h-11 flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-gray-800 transition-colors touch-manipulation sm:flex-none"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    disabled={loggingCall}
                    onClick={onLogCall}
                    title="Log a phone call (uses the text above as the call summary)"
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 disabled:opacity-50 hover:bg-emerald-100 transition-colors touch-manipulation sm:flex-none"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Log call
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {activityTab === "comms" ? (
            commsQ.isLoading ? (
              <div className="py-6 text-center text-sm text-gray-400">Loading communications…</div>
            ) : (commsQ.data?.communications ?? []).length > 0 ? (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {(commsQ.data?.communications ?? []).map((comm) => (
                  <li key={comm.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize text-gray-800">
                        {comm.channel} · {comm.direction}
                      </span>
                      <span className="text-xs text-gray-500">{comm.status ?? "sent"}</span>
                    </div>
                    {comm.subject ? <p className="mt-1 text-xs font-medium text-gray-700">{comm.subject}</p> : null}
                    {comm.body ? (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-600">{comm.body}</p>
                    ) : null}
                    <p className="mt-1 text-[10px] text-gray-400">
                      {new Date(comm.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No outbound communications logged yet.</p>
            )
          ) : null}

          {activityTab === "tasks" ? (
            <>
              {tasksQ.isLoading ? (
                <div className="py-6 text-center text-sm text-gray-400">Loading tasks…</div>
              ) : (
                <div className="space-y-2">
                  {(tasksQ.data?.tasks ?? []).map((task) => {
                    const overdue =
                      !task.completed_at &&
                      task.due_at &&
                      new Date(task.due_at).getTime() < Date.now();
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "flex items-start justify-between gap-3 rounded-lg border px-3 py-2",
                          overdue ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50",
                        )}
                      >
                        <div className="min-w-0">
                          <p className={cn("text-sm font-medium", task.completed_at ? "text-gray-400 line-through" : "text-gray-900")}>
                            {task.title}
                          </p>
                          {task.due_at ? (
                            <p className={cn("text-xs", overdue ? "text-red-700" : "text-gray-500")}>
                              Due {new Date(task.due_at).toLocaleString()}
                            </p>
                          ) : null}
                        </div>
                        {!task.completed_at ? (
                          <button
                            type="button"
                            onClick={() => completeTaskMut.mutate(task.id)}
                            disabled={completeTaskMut.isPending}
                            className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50"
                          >
                            Complete
                          </button>
                        ) : (
                          <span className="shrink-0 text-xs text-green-700">Done</span>
                        )}
                      </div>
                    );
                  })}
                  {(tasksQ.data?.tasks ?? []).length === 0 ? (
                    <p className="text-sm text-gray-400">No follow-up tasks yet.</p>
                  ) : null}
                </div>
              )}
              <form
                className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!taskTitle.trim()) return;
                  createTaskMut.mutate();
                }}
              >
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="New follow-up task…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="datetime-local"
                    value={taskDueAt}
                    onChange={(e) => setTaskDueAt(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={createTaskMut.isPending || !taskTitle.trim()}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    Add task
                  </button>
                </div>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EditField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <span className="mb-1 block text-[10px] text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
      />
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, href }: { icon: typeof User; label: string; value: unknown; href?: string }) {
  if (!value) return null;
  const text = String(value);
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400">{label}</p>
        {href ? (
          <a href={href} className="text-sm text-blue-600 hover:underline truncate block">{text}</a>
        ) : (
          <p className="text-sm text-gray-800 truncate">{text}</p>
        )}
      </div>
    </div>
  );
}
