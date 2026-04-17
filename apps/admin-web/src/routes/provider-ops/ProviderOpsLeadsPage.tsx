import { useCallback, useMemo, useRef, useState } from "react";
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
  Search, Upload, Download, Plus, LayoutGrid, LayoutList,
  Phone, Mail, MapPin, Calendar, Tag, User, ChevronDown,
  Clock, MessageSquare, MessageCircle, ArrowUpDown, CheckSquare, Square,
  Trash2, UserPlus, X, ChevronUp, Filter, MoreHorizontal,
  StickyNote, TrendingUp, ArrowRight, ExternalLink, Pencil,
} from "lucide-react";
import { WhatsAppSendModal } from "@/components/whatsapp/WhatsAppSendModal";
import { BulkWhatsAppModal } from "@/components/whatsapp/BulkWhatsAppModal";

const PAGE_SIZE = 50;
const STAGES = ["all", "new", "contacted", "qualified", "proposal_sent", "negotiating", "won", "lost", "nurture", "matched"] as const;
const STAGE_LABELS: Record<string, string> = {
  all: "All", new: "New", contacted: "Contacted", qualified: "Qualified",
  proposal_sent: "Proposal Sent", negotiating: "Negotiating", won: "Won",
  lost: "Lost", nurture: "Nurture", matched: "Matched",
};
const STAGE_BADGE: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 ring-blue-600/20",
  contacted: "bg-cyan-100 text-cyan-700 ring-cyan-600/20",
  qualified: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  proposal_sent: "bg-violet-100 text-violet-700 ring-violet-600/20",
  negotiating: "bg-purple-100 text-purple-700 ring-purple-600/20",
  won: "bg-green-100 text-green-700 ring-green-600/20",
  lost: "bg-red-100 text-red-700 ring-red-600/20",
  nurture: "bg-amber-100 text-amber-700 ring-amber-600/20",
  matched: "bg-teal-100 text-teal-700 ring-teal-600/20",
};
const STAGE_DOT: Record<string, string> = {
  new: "bg-blue-500", contacted: "bg-cyan-500", qualified: "bg-emerald-500",
  proposal_sent: "bg-violet-500", negotiating: "bg-purple-500", won: "bg-green-500",
  lost: "bg-red-500", nurture: "bg-amber-500", matched: "bg-teal-500",
};
const ACTIVITY_ICONS: Record<string, typeof MessageSquare> = {
  note: StickyNote, stage_change: TrendingUp, call: Phone,
  email: Mail, meeting: Calendar, default: MessageSquare,
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
  matched_provider_id?: string | null;
  provider_lead_categories?: LeadCategory[] | unknown;
  /** §Release-audit 2026-04: Wasender check status, surfaced as a badge. */
  whatsapp_status?: "unknown" | "verified" | "not_found" | "check_failed" | null;
  whatsapp_checked_at?: string | null;
}

/**
 * §Release-audit 2026-04: tiny self-contained chip so the operator can see at
 * a glance whether the lead's phone number has been verified to be on
 * WhatsApp (Wasender reachability check). Previously this signal existed in
 * the DB column `provider_leads.whatsapp_status` and the API already returned
 * it, but the inbox UI never surfaced it.
 */
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

interface LeadsPayload {
  data: Lead[];
  meta: { page: number; limit: number; total: number; has_more: boolean };
  stage_counts: Record<string, number>;
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
  const categoryId = sp.get("category_id") || "";
  const sortBy = sp.get("sort") || "created_at";
  const sortDir = sp.get("dir") || "desc";

  const [searchInput, setSearchInput] = useState(search);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; total_rows_in_file: number; skipped_empty: number; warnings: { row: number; field: string; message: string }[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [detailPanelWidth, setDetailPanelWidth] = useState(480);
  const resizingRef = useRef(false);
  const [whatsAppLead, setWhatsAppLead] = useState<Lead | null>(null);
  const [showBulkWhatsApp, setShowBulkWhatsApp] = useState(false);

  const categoriesQ = useQuery({
    queryKey: adminQueryKeys.globalCategories(),
    queryFn: () => adminApi.getJson<{ data: { id: string; name: string }[] }>("/api/admin/catalog/global-categories?limit=200"),
    enabled: allowed,
    staleTime: 5 * 60_000,
  });
  const globalCategories = categoriesQ.data?.data ?? [];

  const qk = useMemo(() => adminQueryKeys.providerOps.leads(`s=${stage}|p=${page}|q=${search}|c=${country}|cat=${categoryId}|sb=${sortBy}|sd=${sortDir}`), [stage, page, search, country, categoryId, sortBy, sortDir]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (stage !== "all") p.set("stage", stage);
      p.set("page", String(page));
      p.set("limit", String(PAGE_SIZE));
      if (search) p.set("search", search);
      if (country) p.set("country", country);
      if (categoryId) p.set("category_id", categoryId);
      if (sortBy) p.set("sort", sortBy);
      if (sortDir) p.set("dir", sortDir);
      return adminApi.getJson<LeadsPayload>(`/api/admin/provider-ops/leads?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.data ?? [];
  const total = q.data?.meta?.total ?? 0;
  const hasMore = q.data?.meta?.has_more ?? false;
  const stageCounts = q.data?.stage_counts ?? {};

  const selectedLead = rows.find((r) => r.id === selectedLeadId) ?? null;

  // ── Detail query for selected lead ──
  const detailQ = useQuery({
    queryKey: adminQueryKeys.providerOps.leadDetail(selectedLeadId!),
    queryFn: () => adminApi.getJson<Record<string, unknown>>(`/api/admin/provider-ops/leads/${selectedLeadId}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!selectedLeadId,
  });

  const activitiesQ = useQuery({
    queryKey: adminQueryKeys.providerOps.leadActivities(selectedLeadId!),
    queryFn: () => adminApi.getJson<{ data: Activity[] }>(`/api/admin/provider-ops/leads/${selectedLeadId}/activities`, { timeoutMs: 30_000 }),
    enabled: allowed && !!selectedLeadId,
  });

  // ── Mutations ──
  const stageChangeMut = useMutation({
    mutationFn: ({ id, newStage }: { id: string; newStage: string }) =>
      adminApi.patchJson(`/api/admin/provider-ops/leads/${id}/stage`, { stage: newStage }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      adminToast.success("Stage updated");
    },
    onError: (e: Error) => adminToast.error(`Stage update failed: ${e.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteJson(`/api/admin/provider-ops/leads/${id}`),
    onSuccess: () => {
      setSelectedLeadId(null);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      adminToast.success("Lead deleted");
    },
    onError: (e: Error) => adminToast.error(`Delete failed: ${e.message}`),
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

  const updateLeadMut = useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      adminApi.patchJson(`/api/admin/provider-ops/leads/${selectedLeadId}`, fields),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadDetail(selectedLeadId!) });
      adminToast.success("Lead updated");
    },
    onError: (e: Error) => adminToast.error(`Update failed: ${e.message}`),
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

  const handleImportFile = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "tsv" && ext !== "txt") return;
    try {
      setImporting(true);
      setImportResult(null);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/provider-ops/leads/import", { method: "POST", body: formData, credentials: "include" });
      const json = await res.json();
      if (!res.ok) {
        adminToast.error(json?.error?.message ?? json?.message ?? "Import failed — please check your file and try again");
        return;
      }
      setImportResult({ imported: json.data.imported, total_rows_in_file: json.data.total_rows_in_file, skipped_empty: json.data.skipped_empty, warnings: json.data.warnings || [] });
      adminToast.success(`Imported ${json.data.imported as number} leads`);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [qc]);

  const handleExport = useCallback(async () => {
    try {
      setExporting(true);
      const p = new URLSearchParams();
      if (stage !== "all") p.set("stage", stage);
      if (search) p.set("search", search);
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
  }, [stage, search]);

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

      {importResult && (
        <div className="mx-1 mb-2 flex-shrink-0">
          <AdminPanel className="!border-emerald-200 !bg-emerald-50">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-emerald-800">{importResult.imported.toLocaleString()} leads imported</p>
                <p className="text-xs text-emerald-700">{importResult.total_rows_in_file} rows · {importResult.skipped_empty} empty rows skipped</p>
                {importResult.warnings.length > 0 && <p className="text-xs text-amber-600">{importResult.warnings.length} warning(s)</p>}
              </div>
              <button type="button" onClick={() => setImportResult(null)} className="text-xs text-emerald-600 hover:text-emerald-800">Dismiss</button>
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
        </div>
      </div>

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
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm sm:flex-initial">
                <span className="shrink-0 font-medium text-blue-700">{selectedIds.size} selected</span>
                <select
                  className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs text-blue-700 sm:flex-initial"
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    selectedIds.forEach((id) => stageChangeMut.mutate({ id, newStage: e.target.value }));
                    setSelectedIds(new Set());
                    e.target.value = "";
                  }}
                >
                  <option value="">Bulk stage…</option>
                  {STAGES.filter((s) => s !== "all").map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                </select>
                <button type="button" onClick={() => setSelectedIds(new Set())} className="shrink-0 text-blue-500 hover:text-blue-700"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            <div className="ml-auto flex shrink-0 rounded-xl border border-gray-300 bg-white sm:ml-0">
              <button type="button" onClick={() => setViewMode("table")} className={cn("min-h-11 min-w-11 touch-manipulation rounded-l-xl px-2.5 py-2 transition-colors", viewMode === "table" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50")} aria-label="Table view">
                <LayoutList className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setViewMode("card")} className={cn("min-h-11 min-w-11 touch-manipulation rounded-r-xl px-2.5 py-2 transition-colors", viewMode === "card" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50")} aria-label="Card view">
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {filtersOpen && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <select
              value={country}
              onChange={(e) => { const n = new URLSearchParams(sp); if (e.target.value) n.set("country", e.target.value); else n.delete("country"); n.delete("page"); setSp(n, { replace: true }); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="">All Countries</option>
              <option value="ZA">South Africa</option>
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
              <option value="NG">Nigeria</option>
              <option value="KE">Kenya</option>
              <option value="GH">Ghana</option>
            </select>
            <select
              value={categoryId}
              onChange={(e) => { const n = new URLSearchParams(sp); if (e.target.value) n.set("category_id", e.target.value); else n.delete("category_id"); n.delete("page"); setSp(n, { replace: true }); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="">All Categories</option>
              {globalCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
            {(country || categoryId) && (
              <button type="button" onClick={() => { const n = new URLSearchParams(sp); n.delete("country"); n.delete("category_id"); n.delete("page"); setSp(n, { replace: true }); }} className="text-xs text-gray-500 hover:text-gray-700 underline">Clear filters</button>
            )}
          </div>
        )}
      </div>

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
              onStageChange={(id, s) => stageChangeMut.mutate({ id, newStage: s })}
              onWhatsAppClick={(lead) => setWhatsAppLead(lead)}
            />
          ) : (
            <LeadCardGrid
              rows={rows}
              selectedLeadId={selectedLeadId}
              onSelectLead={setSelectedLeadId}
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
              onStageChange={(s) => stageChangeMut.mutate({ id: selectedLeadId, newStage: s })}
              onDelete={() => { if (confirm("Delete this lead?")) deleteMut.mutate(selectedLeadId); }}
              onClose={() => setSelectedLeadId(null)}
              isDeleting={deleteMut.isPending}
              onSave={(fields) => updateLeadMut.mutate(fields)}
              isSaving={updateLeadMut.isPending}
            />
          </div>
        )}
      </div>

      {selectedLeadId && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 pt-[env(safe-area-inset-top,0px)] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Lead details"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedLeadId(null); }}
        >
          <div
            className="mx-auto flex min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl"
            style={{
              maxHeight: "min(92dvh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 0.5rem))",
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
              onStageChange={(s) => stageMutateSafe(stageChangeMut, selectedLeadId, s)}
              onDelete={() => { if (confirm("Delete this lead?")) deleteMut.mutate(selectedLeadId); }}
              onClose={() => setSelectedLeadId(null)}
              isDeleting={deleteMut.isPending}
              onSave={(fields) => updateLeadMut.mutate(fields)}
              isSaving={updateLeadMut.isPending}
            />
          </div>
        </div>
      )}

      {/* Floating action bar for bulk selection */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-2xl bg-gray-900 px-4 py-3 text-white shadow-2xl transition-all sm:gap-4 sm:px-6">
          <span className="text-sm font-medium">{selectedIds.size} leads selected</span>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            onClick={() => setShowBulkWhatsApp(true)}
          >
            <MessageCircle className="h-4 w-4" /> Send WhatsApp
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
  stageMut: { mutate: (args: { id: string; newStage: string }) => void },
  id: string,
  newStage: string
) {
  stageMut.mutate({ id, newStage });
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

function LeadTable({ rows, selectedLeadId, selectedIds, sortBy, sortDir, onSelectLead, onToggleSelect, onToggleSelectAll, onSort, onStageChange, onWhatsAppClick }: {
  rows: Lead[];
  selectedLeadId: string | null;
  selectedIds: Set<string>;
  sortBy: string;
  sortDir: string;
  onSelectLead: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onSort: (col: string) => void;
  onStageChange: (id: string, stage: string) => void;
  onWhatsAppClick?: (lead: Lead) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => onToggleSelect(lead.id)} className="text-gray-400 hover:text-gray-700">
                    {isChecked ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                  </button>
                </td>
                <td className="px-3 py-2.5">
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
                <td className="px-3 py-2.5">
                  {/* Touch: always show stage control (no hover). Desktop: badge until row hover */}
                  <div className="md:hidden">
                    <select
                      value={lead.commercial_stage}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { e.stopPropagation(); onStageChange(lead.id, e.target.value); }}
                      className="max-w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 touch-manipulation"
                    >
                      {STAGES.filter((s) => s !== "all").map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                    </select>
                  </div>
                  <div className="hidden md:block">
                    {isHovered ? (
                      <select
                        value={lead.commercial_stage}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); onStageChange(lead.id, e.target.value); }}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700"
                      >
                        {STAGES.filter((s) => s !== "all").map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                      </select>
                    ) : (
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", badge)}>
                        {lead.commercial_stage.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 md:table-cell">
                  <span className="inline-block rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">{lead.source}</span>
                </td>
                <td className="hidden px-3 py-2.5 lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {cats.slice(0, 2).map((c) => (
                      <span key={c} className="inline-block rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">{c}</span>
                    ))}
                    {cats.length > 2 && <span className="text-[10px] text-gray-400">+{cats.length - 2}</span>}
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 xl:table-cell">
                  {lead.suggested_location_text && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <MapPin className="h-3 w-3" />{lead.suggested_location_text}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-xs text-gray-500">{new Date(lead.created_at).toLocaleDateString()}</span>
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
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

function LeadCardGrid({ rows, selectedLeadId, onSelectLead }: { rows: Lead[]; selectedLeadId: string | null; onSelectLead: (id: string) => void }) {
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
                "w-full rounded-xl border bg-white p-4 text-left transition-all hover:shadow-md",
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
                      {lead.commercial_stage.replace(/_/g, " ")}
                    </span>
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
              <div className="mt-2.5 flex items-center justify-between text-[10px] text-gray-400">
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

function DetailPanel({ lead, activities, isLoading, noteText, setNoteText, onAddNote, addingNote, onStageChange, onDelete, onClose, isDeleting, onSave, isSaving }: {
  lead: Lead | null;
  activities: Activity[];
  isLoading: boolean;
  noteText: string;
  setNoteText: (v: string) => void;
  onAddNote: () => void;
  addingNote: boolean;
  onStageChange: (stage: string) => void;
  onDelete: () => void;
  onClose: () => void;
  isDeleting: boolean;
  onSave?: (fields: Record<string, unknown>) => void;
  isSaving?: boolean;
}) {
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
                  {lead.commercial_stage.replace(/_/g, " ")}
                </span>
                <span className="inline-block rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500">{lead.source}</span>
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
          <button type="button" disabled={isDeleting} onClick={onDelete} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 touch-manipulation hover:bg-red-50 disabled:opacity-50">
            <Trash2 className="h-3 w-3" />Delete
          </button>
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
              <div className="ml-7 -mt-1">
                <WhatsAppStatusChip status={lead.whatsapp_status} />
                {lead.whatsapp_checked_at && (
                  <span className="ml-2 text-[11px] text-gray-400">
                    checked {new Date(lead.whatsapp_checked_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            )}
            <InfoRow icon={MapPin} label="Location" value={lead.suggested_location_text} />
            <InfoRow icon={Calendar} label="Created" value={new Date(lead.created_at).toLocaleString()} />
            {lead.assigned_to && <InfoRow icon={UserPlus} label="Assigned to" value={lead.assigned_to} />}
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

        {/* Activity timeline */}
        <div className="px-4 py-3 sm:px-5">
          <label className="mb-3 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Activity Timeline</label>
          {activities.length > 0 ? (
            <div className="relative space-y-0">
              <div className="absolute left-3 top-3 bottom-0 w-px bg-gray-200" />
              {activities.map((a, i) => {
                const Icon = ACTIVITY_ICONS[a.activity_type] || ACTIVITY_ICONS.default;
                return (
                  <div key={a.id ?? i} className="relative flex gap-3 pb-4">
                    <div className={cn(
                      "relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full",
                      a.activity_type === "stage_change" ? "bg-purple-100" :
                      a.activity_type === "note" ? "bg-blue-100" :
                      a.activity_type === "call" ? "bg-green-100" :
                      a.activity_type === "email" ? "bg-amber-100" : "bg-gray-100",
                    )}>
                      <Icon className={cn(
                        "h-3 w-3",
                        a.activity_type === "stage_change" ? "text-purple-600" :
                        a.activity_type === "note" ? "text-blue-600" :
                        a.activity_type === "call" ? "text-green-600" :
                        a.activity_type === "email" ? "text-amber-600" : "text-gray-500",
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

          {/* Add note */}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              placeholder="Add a note…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && noteText.trim() && onAddNote()}
              className="min-h-11 w-full flex-1 rounded-lg border border-gray-200 px-3 py-2 text-base placeholder:text-gray-400 focus:border-gray-400 focus:outline-none sm:text-sm"
            />
            <button
              type="button"
              disabled={!noteText.trim() || addingNote}
              onClick={onAddNote}
              className="min-h-11 w-full shrink-0 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-gray-800 transition-colors touch-manipulation sm:w-auto"
            >
              Add
            </button>
          </div>
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
