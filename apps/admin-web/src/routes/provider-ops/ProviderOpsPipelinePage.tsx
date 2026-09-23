import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { adminToast } from "@/lib/adminToast";
import { handleLeadConcurrent409 } from "@/lib/handleLeadConcurrentUpdate";
import { LEAD_STAGE_OPTIONS as PIPELINE_STAGES } from "@/lib/providerOpsLeadStages";
import { Trash2, UserPlus } from "lucide-react";
import { PipelineStageColumn } from "@/components/provider-ops/PipelineStageColumn";
import {
  AssigneeSearchPanel,
  labelOf,
  type AssignableUser,
} from "@/components/provider-ops/LeadAssigneeInline";
import { invalidateAdminShellCounts } from "@/lib/invalidateAdminShellCounts";
import { useAdminConfirmAction } from "@/hooks/useAdminConfirmAction";
import { PROVIDER_OPS_BULK_LEAD_MAX, PROVIDER_OPS_BULK_STAGE_EXCLUDE } from "@/lib/providerOpsBulkLimits";

const OPS_PIPELINE_REFETCH_MS = 45_000;

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
  country?: string | null;
  suggested_location_text: string | null;
  created_at: string;
  tags?: string[];
  whatsapp_status?: "unknown" | "verified" | "not_found" | "check_failed" | null;
  provider_lead_categories?: LeadCategory[];
  updated_at?: string;
  assigned_to?: string | null;
  assigned_user?: { id: string; email: string | null; full_name: string | null } | null;
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

function buildPipelineFilterQuery(
  country: string,
  province: string,
  assignedToFilter: string,
  categoryIds: string[],
): string {
  let q = "";
  if (country) q += `&country=${encodeURIComponent(country)}`;
  if (province) q += `&province=${encodeURIComponent(province)}`;
  if (assignedToFilter) q += `&assigned_to=${encodeURIComponent(assignedToFilter)}`;
  categoryIds.forEach((id) => {
    q += `&category_ids=${encodeURIComponent(id)}`;
  });
  return q;
}

export function ProviderOpsPipelinePage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [landedLeadId, setLandedLeadId] = useState<string | null>(null);
  const dragPreviewNodeRef = useRef<HTMLElement | null>(null);
  const suppressCardClickRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const { requestConfirm, ConfirmDialog } = useAdminConfirmAction();

  const country = sp.get("country") || "";
  const province = sp.get("province") || "";
  const assignedToFilter = sp.get("assigned_to") || "";
  const categoryIds = useMemo(() => parseCategoryIdsParam(sp), [sp]);
  const categoryKey = categoryIds.join(",");
  const filterQuery = buildPipelineFilterQuery(country, province, assignedToFilter, categoryIds);
  const countsQk = adminQueryKeys.providerOps.pipelineStats();

  const countsQ = useQuery({
    queryKey: [...countsQk, filterQuery],
    enabled: allowed,
    queryFn: () =>
      adminApi.getJson<LeadsPayload>(
        `/api/admin/provider-ops/leads?page=1&limit=1${filterQuery}`,
        { timeoutMs: 60_000 },
      ),
    refetchInterval: OPS_PIPELINE_REFETCH_MS,
    refetchOnWindowFocus: true,
  });

  const stageCounts = countsQ.data?.stage_counts ?? {};
  const totalLeads = stageCounts.all ?? countsQ.data?.meta?.total ?? 0;
  const filterOptions = countsQ.data?.filter_options;
  const countryOptions = filterOptions?.countries ?? [];
  const provinceOptions = (filterOptions?.provinces ?? []).filter(
    (opt) => !country || !opt.country || opt.country === country,
  );
  const categoryOptions = filterOptions?.categories ?? [];
  const assigneeFilterOptions = filterOptions?.assignees ?? [];
  const selectedCategoryNames = categoryIds.map((id) => categoryOptions.find((c) => c.id === id)?.name ?? "selected");

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
    },
    onError: (e: Error) => {
      if (handleLeadConcurrent409(e)) {
        void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
        return;
      }
      adminToast.error(`Assign failed: ${e.message}`);
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) =>
      adminApi.postJson<{ deleted: number; skipped_matched: string[]; not_found: string[] }>(
        "/api/admin/provider-ops/leads/bulk-delete",
        { ids },
      ),
    onSuccess: (data) => {
      setSelectedIds(new Set());
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      invalidateAdminShellCounts(qc);
      if (data.deleted > 0) adminToast.success(`Deleted ${data.deleted} lead(s)`);
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const bulkStageMut = useMutation({
    mutationFn: (newStage: string) =>
      adminApi.postJson<{
        updated: string[];
        conflicts: string[];
        skipped: { id: string; reason: string }[];
        not_found: string[];
      }>("/api/admin/provider-ops/leads/bulk-stage", {
        stage: newStage,
        items: [...selectedIds].map((id) => ({ id })),
      }),
    onSuccess: (data) => {
      setSelectedIds(new Set());
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      invalidateAdminShellCounts(qc);
      if (data.updated.length) adminToast.success(`Updated ${data.updated.length} lead(s)`);
      if (data.skipped.length) {
        const matchedSkips = data.skipped.filter((s) =>
          s.reason.toLowerCase().includes("matched_provider_id"),
        ).length;
        if (matchedSkips > 0) {
          adminToast.warning(
            `${matchedSkips} skipped — Matched requires a provider link (use single-lead update).`,
          );
        }
        const other = data.skipped.length - matchedSkips;
        if (other > 0) adminToast.warning(`${other} lead${other === 1 ? "" : "s"} skipped`);
      }
      if (data.conflicts.length) adminToast.warning(`${data.conflicts.length} conflict(s) — refresh and retry`);
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const bulkAssignMut = useMutation({
    mutationFn: (u: AssignableUser) =>
      adminApi.postJson<{
        updated: string[];
        conflicts: string[];
        skipped: { id: string; reason: string }[];
        not_found: string[];
      }>("/api/admin/provider-ops/leads/bulk-assign", {
        assigned_to: u.id,
        assigned_to_name: labelOf(u),
        items: [...selectedIds].map((id) => ({ id })),
      }),
    onSuccess: (data) => {
      setSelectedIds(new Set());
      setBulkAssignOpen(false);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      invalidateAdminShellCounts(qc);
      if (data.updated.length) adminToast.success(`Assigned ${data.updated.length} lead(s)`);
      if (data.conflicts.length) adminToast.warning(`${data.conflicts.length} conflict(s) — refresh and retry`);
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const stageMut = useMutation({
    mutationFn: ({
      id,
      stage,
      expected_updated_at,
    }: {
      id: string;
      stage: string;
      expected_updated_at?: string;
    }) =>
      adminApi.patchJson(`/api/admin/provider-ops/leads/${id}/stage`, {
        stage,
        ...(expected_updated_at ? { expected_updated_at } : {}),
      }),
    onSuccess: (_data, { id }) => {
      setLandedLeadId(id);
      window.setTimeout(() => setLandedLeadId((cur) => (cur === id ? null : cur)), 480);
      adminToast.success("Stage updated");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.dashboard() });
    },
    onError: (err: Error) => {
      if (handleLeadConcurrent409(err)) {
        void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
        return;
      }
      adminToast.error(`Stage update failed: ${err.message}`);
    },
  });

  useEffect(() => {
    return () => {
      dragPreviewNodeRef.current?.remove();
      dragPreviewNodeRef.current = null;
    };
  }, []);

  const cleanupDragPreview = useCallback(() => {
    dragPreviewNodeRef.current?.remove();
    dragPreviewNodeRef.current = null;
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent, leadId: string, cardEl: HTMLElement, updatedAt?: string, fromStage?: string) => {
      suppressCardClickRef.current = true;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `${leadId}|${updatedAt ?? ""}|${fromStage ?? ""}`);
      setDraggedLeadId(leadId);

      const clone = cardEl.cloneNode(true) as HTMLElement;
      clone.style.cssText = [
        "position:fixed",
        "left:-9999px",
        "top:0",
        "opacity:0.72",
        "pointer-events:none",
        `width:${cardEl.offsetWidth}px`,
        "box-shadow:0 14px 28px rgba(0,0,0,0.18)",
        "border-radius:0.5rem",
      ].join(";");
      document.body.appendChild(clone);
      dragPreviewNodeRef.current = clone;

      const rect = cardEl.getBoundingClientRect();
      e.dataTransfer.setDragImage(clone, e.clientX - rect.left, e.clientY - rect.top);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    cleanupDragPreview();
    setDraggedLeadId(null);
    setDragOverStage(null);
    window.setTimeout(() => {
      suppressCardClickRef.current = false;
    }, 0);
  }, [cleanupDragPreview]);

  function handleDrop(targetStage: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOverStage(null);
    const raw = e.dataTransfer.getData("text/plain") || draggedLeadId || "";
    const parts = raw.split("|");
    const id = parts[0] ?? "";
    const updatedAt = parts[1] ?? "";
    const fromStage = parts[2] ?? "";
    if (!id) return;
    if (fromStage && fromStage === targetStage) {
      setDraggedLeadId(null);
      return;
    }
    setDraggedLeadId(null);
    stageMut.mutate({
      id,
      stage: targetStage,
      ...(updatedAt ? { expected_updated_at: updatedAt } : {}),
    });
  }

  if (denied) return denied;
  if (countsQ.isPending) return <div className="space-y-6"><AdminPageHeader title="Pipeline Board" /><AdminPanel><AdminPageSkeleton rows={6} /></AdminPanel></div>;
  if (countsQ.error) {
    if (isAdminApiAuthFailure(countsQ.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={countsQ.error.message} onRetry={() => void countsQ.refetch()} />;
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)]">
      <style>{`
        @keyframes pipeline-card-land {
          from { opacity: 0.65; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .pipeline-card-land {
          animation: pipeline-card-land 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>
      <div className="flex-shrink-0 px-2 pt-1 sm:px-1">
        <AdminPageHeader
          title="Pipeline Board"
          description={`${totalLeads} leads total · ${PIPELINE_STAGES.length} stages · Drag to update status · Load more per column`}
        />
        {(country || province || categoryIds.length > 0 || assignedToFilter) ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
            {assignedToFilter ? (
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(sp);
                  next.delete("assigned_to");
                  setSp(next, { replace: true });
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
                  const next = new URLSearchParams(sp);
                  next.delete("country");
                  next.delete("province");
                  setSp(next, { replace: true });
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
                  const next = new URLSearchParams(sp);
                  next.delete("province");
                  setSp(next, { replace: true });
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
                  const next = new URLSearchParams(sp);
                  next.delete("category_ids");
                  next.delete("category_id");
                  setSp(next, { replace: true });
                }}
                className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700"
              >
                Categories: {selectedCategoryNames.join(", ")} ×
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2 px-1 pb-1">
          <select
            value={country}
            onChange={(e) => {
              const next = new URLSearchParams(sp);
              if (e.target.value) next.set("country", e.target.value); else next.delete("country");
              next.delete("page");
              setSp(next, { replace: true });
            }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700"
          >
            <option value="">All Countries</option>
            {countryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label} ({opt.count})</option>
            ))}
          </select>
          <select
            value={province}
            onChange={(e) => {
              const next = new URLSearchParams(sp);
              if (e.target.value) next.set("province", e.target.value); else next.delete("province");
              next.delete("page");
              setSp(next, { replace: true });
            }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700"
          >
            <option value="">All Provinces / States</option>
            {provinceOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label} ({opt.count})</option>
            ))}
          </select>
          <select
            value={assignedToFilter}
            onChange={(e) => {
              const next = new URLSearchParams(sp);
              if (e.target.value) next.set("assigned_to", e.target.value);
              else next.delete("assigned_to");
              setSp(next, { replace: true });
            }}
            className="min-w-[180px] rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700"
          >
            <option value="">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {assigneeFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.count})
              </option>
            ))}
          </select>
          <div className="min-w-[220px] rounded-lg border border-gray-300 bg-white p-2">
            <div className="mb-1 text-[11px] font-medium text-gray-600">Categories</div>
            <div className="max-h-36 space-y-1 overflow-auto pr-1">
              {categoryOptions.map((opt) => {
                const checked = categoryIds.includes(opt.id);
                return (
                  <label key={opt.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-gray-700 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = new URLSearchParams(sp);
                        const selected = new Set(categoryIds);
                        if (e.target.checked) selected.add(opt.id);
                        else selected.delete(opt.id);
                        next.delete("category_id");
                        next.delete("category_ids");
                        [...selected].forEach((id) => next.append("category_ids", id));
                        next.delete("page");
                        setSp(next, { replace: true });
                      }}
                    />
                    <span className="flex-1 truncate">{opt.name}</span>
                    <span className="text-gray-400">{opt.count}</span>
                  </label>
                );
              })}
            </div>
          </div>
          {(country || province || categoryIds.length > 0 || assignedToFilter) ? (
            <button
              type="button"
              className="text-xs text-gray-500 underline hover:text-gray-700"
              onClick={() => {
                const next = new URLSearchParams(sp);
                next.delete("country");
                next.delete("province");
                next.delete("category_ids");
                next.delete("category_id");
                next.delete("assigned_to");
                setSp(next, { replace: true });
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain px-2 pb-4 [-webkit-overflow-scrolling:touch] touch-pan-x sm:px-1">
        {PIPELINE_STAGES.map((stage) => (
          <PipelineStageColumn
            key={stage.key}
            stage={stage}
            filterQuery={filterQuery}
            stageCount={stageCounts[stage.key] ?? 0}
            enabled={allowed}
            selectedIds={selectedIds}
            onToggleSelect={(id) => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) {
                  next.delete(id);
                  return next;
                }
                if (next.size >= PROVIDER_OPS_BULK_LEAD_MAX) {
                  adminToast.warning(`Bulk actions are limited to ${PROVIDER_OPS_BULK_LEAD_MAX} leads at a time`);
                  return prev;
                }
                next.add(id);
                return next;
              });
            }}
            dragOverStage={dragOverStage}
            draggedLeadId={draggedLeadId}
            landedLeadId={landedLeadId}
            onDragOverStage={setDragOverStage}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            suppressCardClickRef={suppressCardClickRef}
            stageMut={stageMut}
            assignLeadMut={assignLeadMut}
          />
        ))}
      </div>

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
              onPick={(user) => bulkAssignMut.mutate(user)}
            />
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-2xl bg-gray-900 px-4 py-3 text-white shadow-2xl sm:gap-4 sm:px-6">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <select
            className="rounded-xl border border-gray-600 bg-gray-800 px-3 py-2 text-sm"
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              bulkStageMut.mutate(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">Move to stage…</option>
            {PIPELINE_STAGES.filter((s) => !PROVIDER_OPS_BULK_STAGE_EXCLUDE.has(s.key)).map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium"
            onClick={() => setBulkAssignOpen(true)}
          >
            <UserPlus className="h-4 w-4" /> Assign
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium"
            onClick={() => {
              const ids = [...selectedIds];
              requestConfirm({
                title: "Delete leads",
                consequence: `Delete ${ids.length} leads? Matched leads will be skipped.`,
                variant: "danger",
                confirmLabel: "Delete",
                onConfirm: async () => bulkDeleteMut.mutate(ids),
              });
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
          <button type="button" className="text-sm text-gray-400 hover:text-white" onClick={() => setSelectedIds(new Set())}>
            Clear
          </button>
        </div>
      )}
      <ConfirmDialog />
    </div>
  );
}
