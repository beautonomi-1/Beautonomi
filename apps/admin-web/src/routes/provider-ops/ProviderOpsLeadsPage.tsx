import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminTabButtonClass, adminToolbarButtonClass } from "@/lib/adminUi";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminSpaTo } from "@/lib/adminSpaPath";

const PAGE_SIZE = 50;
const STAGES = ["all", "new", "contacted", "qualified", "proposal_sent", "negotiating", "won", "lost", "nurture", "matched"] as const;
const STAGE_LABELS: Record<string, string> = {
  all: "All", new: "New", contacted: "Contacted", qualified: "Qualified",
  proposal_sent: "Proposal Sent", negotiating: "Negotiating", won: "Won",
  lost: "Lost", nurture: "Nurture", matched: "Matched",
};
const STAGE_BADGE: Record<string, string> = {
  new: "bg-blue-100 text-blue-700", contacted: "bg-cyan-100 text-cyan-700",
  qualified: "bg-emerald-100 text-emerald-700", proposal_sent: "bg-violet-100 text-violet-700",
  negotiating: "bg-purple-100 text-purple-700", won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700", nurture: "bg-amber-100 text-amber-700",
  matched: "bg-teal-100 text-teal-700",
};

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
  tags: string[];
}

interface LeadsPayload {
  data: { data: Lead[]; meta: { page: number; limit: number; total: number; has_more: boolean }; stage_counts: Record<string, number> };
}

export function ProviderOpsLeadsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const stage = sp.get("stage") || "all";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const search = sp.get("search") || "";
  const [searchInput, setSearchInput] = useState(search);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; total_rows_in_file: number; skipped_empty: number; warnings: { row: number; field: string; message: string }[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const qk = useMemo(() => adminQueryKeys.providerOps.leads(`s=${stage}|p=${page}|q=${search}`), [stage, page, search]);

  const q = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (stage !== "all") p.set("stage", stage);
      p.set("page", String(page));
      p.set("limit", String(PAGE_SIZE));
      if (search) p.set("search", search);
      return adminApi.getJson<LeadsPayload>(`/api/admin/provider-ops/leads?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const data = q.data?.data;
  const rows = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const hasMore = data?.meta?.has_more ?? false;
  const stageCounts = data?.stage_counts ?? {};

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
      if (!res.ok) return;
      setImportResult({ imported: json.data.imported, total_rows_in_file: json.data.total_rows_in_file, skipped_empty: json.data.skipped_empty, warnings: json.data.warnings || [] });
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
      if (!res.ok) return;
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

  if (denied) return denied;
  if (q.isLoading) return <div className="space-y-6"><AdminPageHeader title="Lead Inbox" /><AdminPanel><AdminPageSkeleton rows={6} /></AdminPanel></div>;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div
      className={`space-y-6 ${dragOver ? "ring-2 ring-inset ring-blue-300 bg-blue-50/30 rounded-xl" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleImportFile(f); }}
    >
      <AdminPageHeader
        title="Lead Inbox"
        description={`${total.toLocaleString()} leads · Manage your provider pipeline`}
        actions={
          <div className="flex flex-wrap gap-2">
            <a href="/api/admin/provider-ops/leads/template?format=with-categories" download className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Template</a>
            <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }} />
            <button type="button" disabled={importing} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50" onClick={() => fileInputRef.current?.click()}>
              {importing ? "Importing..." : "Import CSV"}
            </button>
            <button type="button" disabled={exporting || total === 0} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50" onClick={handleExport}>Export</button>
            <Link to={adminSpaTo("/admin/provider-ops/leads/new")} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800">New Lead</Link>
          </div>
        }
      />

      {importResult && (
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
      )}

      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search by name, email, phone..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commitSearch()}
          className="w-full max-w-sm rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
        />
        <button type="button" className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white" onClick={commitSearch}>Search</button>
      </div>

      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <button key={s} type="button" className={adminTabButtonClass(stage === s)} onClick={() => setStage(s)}>
              {STAGE_LABELS[s]}{stageCounts[s] != null ? ` (${stageCounts[s]})` : ""}
            </button>
          ))}
        </div>
      </AdminPanel>

      {rows.length === 0 ? (
        <EmptyState title="No leads found" />
      ) : (
        <div className="space-y-2">
          {rows.map((lead) => {
            const name = lead.business_name || lead.contact_person_name || "Unnamed Lead";
            const badge = STAGE_BADGE[lead.commercial_stage] || "bg-gray-100 text-gray-600";
            return (
              <Link key={lead.id} to={adminSpaTo(`/admin/provider-ops/leads/${lead.id}`)}>
                <AdminPanel className="cursor-pointer transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{name}</span>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${badge}`}>{lead.commercial_stage.replace(/_/g, " ")}</span>
                        <span className="inline-block rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600">{lead.source}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        {lead.email && <span>{lead.email}</span>}
                        {lead.phone_e164 && <span>{lead.phone_e164}</span>}
                        {lead.suggested_location_text && <span>{lead.suggested_location_text}</span>}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-gray-400">{new Date(lead.created_at).toLocaleDateString()}</span>
                  </div>
                </AdminPanel>
              </Link>
            );
          })}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}</p>
          <div className="flex gap-2">
            <button type="button" className={adminToolbarButtonClass(page <= 1)} disabled={page <= 1} onClick={() => { const n = new URLSearchParams(sp); n.set("page", String(page - 1)); setSp(n, { replace: true }); }}>Previous</button>
            <button type="button" className={adminToolbarButtonClass(!hasMore)} disabled={!hasMore} onClick={() => { const n = new URLSearchParams(sp); n.set("page", String(page + 1)); setSp(n, { replace: true }); }}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
