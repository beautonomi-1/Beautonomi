import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDER_OPS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { cn } from "@/lib/cn";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";
import { handleLeadConcurrent409 } from "@/lib/handleLeadConcurrentUpdate";
import { LEAD_STAGE_OPTIONS as PIPELINE_STAGES } from "@/lib/providerOpsLeadStages";
import { GripVertical, Mail, Phone, MapPin, Tag, Calendar } from "lucide-react";
import { LeadAssigneeInline } from "@/components/provider-ops/LeadAssigneeInline";

const PIPELINE_PAGE_SIZE = 120;
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

function WhatsAppStatusChip({ status }: { status?: Lead["whatsapp_status"] }) {
  const s = status || "unknown";
  const config: Record<string, { label: string; className: string }> = {
    verified: { label: "WA verified", className: "bg-emerald-50 text-emerald-700" },
    not_found: { label: "No WhatsApp", className: "bg-amber-50 text-amber-700" },
    check_failed: { label: "WA check failed", className: "bg-rose-50 text-rose-700" },
    unknown: { label: "WA not checked", className: "bg-zinc-100 text-zinc-600" },
  };
  const item = config[s] || config.unknown;
  return <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-medium", item.className)}>{item.label}</span>;
}

function assigneeDisplayName(lead: Lead): string {
  if (!lead.assigned_to) return "—";
  const u = lead.assigned_user;
  if (u && typeof u === "object") {
    const n = u.full_name?.trim() || "";
    const e = u.email?.trim() || "";
    if (n || e) return n || e;
  }
  return `${lead.assigned_to.slice(0, 8)}…`;
}

function applyLeadStageInCache(
  old: InfiniteData<LeadsPayload> | undefined,
  id: string,
  stage: string,
): InfiniteData<LeadsPayload> | undefined {
  if (!old?.pages?.length) return old;
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      data: page.data.map((lead) => (lead.id === id ? { ...lead, commercial_stage: stage } : lead)),
    })),
  };
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

  const country = sp.get("country") || "";
  const province = sp.get("province") || "";
  const assignedToFilter = sp.get("assigned_to") || "";
  const categoryIds = useMemo(() => parseCategoryIdsParam(sp), [sp]);
  const categoryKey = categoryIds.join(",");
  const qk = adminQueryKeys.providerOps.leads(
    `pipeline-board|country=${country}|province=${province}|category=${categoryKey}|assigned=${assignedToFilter}`,
  );

  const q = useInfiniteQuery({
    queryKey: qk,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      adminApi.getJson<LeadsPayload>(
        `/api/admin/provider-ops/leads?page=${pageParam}&limit=${PIPELINE_PAGE_SIZE}${country ? `&country=${encodeURIComponent(country)}` : ""}${province ? `&province=${encodeURIComponent(province)}` : ""}${assignedToFilter ? `&assigned_to=${encodeURIComponent(assignedToFilter)}` : ""}${categoryIds.map((id) => `&category_ids=${encodeURIComponent(id)}`).join("")}`,
        { timeoutMs: 60_000 },
      ),
    getNextPageParam: (lastPage) => (lastPage.meta.has_more ? lastPage.meta.page + 1 : undefined),
    enabled: allowed,
    refetchInterval: OPS_PIPELINE_REFETCH_MS,
    refetchOnWindowFocus: true,
  });

  const leads = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);
  const totalLeads = q.data?.pages[0]?.meta.total ?? leads.length;
  const loadedCount = leads.length;
  const filterOptions = q.data?.pages[0]?.filter_options;
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
        void qc.invalidateQueries({ queryKey: qk });
        return;
      }
      adminToast.error(`Assign failed: ${e.message}`);
    },
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
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: qk });
      const previousStage = qc
        .getQueryData<InfiniteData<LeadsPayload>>(qk)
        ?.pages.flatMap((p) => p.data)
        .find((l) => l.id === id)?.commercial_stage;
      qc.setQueryData<InfiniteData<LeadsPayload>>(qk, (old) => applyLeadStageInCache(old, id, stage));
      queueMicrotask(() => {
        setLandedLeadId(id);
        window.setTimeout(() => setLandedLeadId((cur) => (cur === id ? null : cur)), 480);
      });
      return { previousStage, id };
    },
    onError: (err: Error, { id }, context) => {
      setLandedLeadId((cur) => (cur === id ? null : cur));
      if (context?.previousStage !== undefined) {
        qc.setQueryData<InfiniteData<LeadsPayload>>(qk, (old) => applyLeadStageInCache(old, id, context.previousStage!));
      }
      if (handleLeadConcurrent409(err)) {
        void qc.invalidateQueries({ queryKey: qk });
        void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.dashboard() });
        return;
      }
      adminToast.error(`Stage update failed: ${err.message}`);
    },
    onSuccess: () => {
      adminToast.success("Stage updated");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.dashboard() });
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
    (e: React.DragEvent, leadId: string, cardEl: HTMLElement) => {
      suppressCardClickRef.current = true;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", leadId);
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
    const id = e.dataTransfer.getData("text/plain") || draggedLeadId || "";
    if (!id) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.commercial_stage === targetStage) {
      setDraggedLeadId(null);
      return;
    }
    setDraggedLeadId(null);
    stageMut.mutate({
      id: lead.id,
      stage: targetStage,
      expected_updated_at: lead.updated_at,
    });
  }

  if (denied) return denied;
  if (q.isPending) return <div className="space-y-6"><AdminPageHeader title="Pipeline Board" /><AdminPanel><AdminPageSkeleton rows={6} /></AdminPanel></div>;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
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
          description={`${totalLeads} leads total · ${loadedCount} loaded across ${PIPELINE_STAGES.length} stages · Drag to update status · Swipe columns on mobile`}
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
        {q.hasNextPage && (
          <div className="mt-2 flex items-center gap-3 px-1 pb-1">
            <button
              type="button"
              disabled={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {q.isFetchingNextPage ? "Loading…" : `Load more (${loadedCount} of ${totalLeads})`}
            </button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain px-2 pb-4 [-webkit-overflow-scrolling:touch] touch-pan-x sm:px-1">
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.commercial_stage === stage.key);
          const isOver = dragOverStage === stage.key;
          return (
            <div
              key={stage.key}
              className={cn(
                "flex w-[min(85vw,18rem)] max-w-sm flex-shrink-0 flex-col rounded-xl border-2 transition-all duration-150 sm:w-72",
                isOver
                  ? "border-[3px] border-blue-500 bg-blue-100/70 shadow-xl ring-4 ring-blue-300/40 scale-[1.02]"
                  : stage.color,
              )}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverStage(stage.key); }}
              onDragLeave={(e) => {
                const next = e.relatedTarget as Node | null;
                if (next && e.currentTarget.contains(next)) return;
                setDragOverStage(null);
              }}
              onDrop={(ev) => handleDrop(stage.key, ev)}
            >
              {/* Column header */}
              <div className="flex-shrink-0 rounded-t-[10px] border-b bg-white/70 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", stage.dot)} />
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800">{stage.label}</h3>
                      <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-gray-500">{stage.description}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-bold",
                    stageLeads.length > 0 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500",
                  )}>
                    {stageLeads.length}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain p-2 [-webkit-overflow-scrolling:touch]">
                {stageLeads.map((lead) => {
                  const name = lead.business_name || lead.contact_person_name || "Unnamed";
                  const cats = (lead.provider_lead_categories ?? []).map((c) => c.global_service_categories?.name).filter(Boolean);
                  const isDragging = draggedLeadId === lead.id;
                  return (
                    <div key={lead.id} className="relative">
                      {isDragging && (
                        <div
                          className="absolute inset-0 z-0 flex min-h-[7.5rem] flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-100/90 text-[10px] font-medium text-gray-400"
                          aria-hidden
                        >
                          Drop elsewhere
                        </div>
                      )}
                      <div
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead.id, e.currentTarget)}
                        onDragEnd={handleDragEnd}
                        className={cn("relative z-10", isDragging && "opacity-0")}
                      >
                        <Link
                          to={adminSpaTo(`/admin/provider-ops/leads/${lead.id}`)}
                          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                            if (suppressCardClickRef.current) {
                              e.preventDefault();
                            }
                          }}
                          className="block"
                        >
                          <div
                            className={cn(
                              "group cursor-grab rounded-lg border bg-white transition-all duration-200 active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5",
                              landedLeadId === lead.id && "pipeline-card-land",
                            )}
                          >
                            {/* Drag handle hint */}
                            <div className="flex items-center gap-1 border-b border-gray-50 px-3 py-2">
                              <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">
                                  {name.charAt(0).toUpperCase()}
                                </div>
                                <p className="truncate text-sm font-medium text-gray-900">{name}</p>
                              </div>
                            </div>

                            <div className="space-y-1.5 px-3 pb-2.5 pt-1.5">
                              {lead.email && (
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500 truncate">
                                  <Mail className="h-3 w-3 flex-shrink-0 text-gray-400" />{lead.email}
                                </div>
                              )}
                              {lead.phone_e164 && (
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                  <Phone className="h-3 w-3 flex-shrink-0 text-gray-400" />{lead.phone_e164}
                                  <WhatsAppStatusChip status={lead.whatsapp_status} />
                                </div>
                              )}
                              {lead.suggested_location_text && (
                                <div className="flex items-center gap-1.5 text-[11px] text-gray-500 truncate">
                                  <MapPin className="h-3 w-3 flex-shrink-0 text-gray-400" />{lead.suggested_location_text}
                                </div>
                              )}

                              {/* Categories */}
                              {cats.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {cats.slice(0, 2).map((c) => (
                                    <span key={c} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-600">{c}</span>
                                  ))}
                                  {cats.length > 2 && <span className="text-[9px] text-gray-400">+{cats.length - 2}</span>}
                                </div>
                              )}

                              {/* Tags */}
                              {lead.tags && lead.tags.length > 0 && (
                                <div className="flex items-center gap-1 pt-0.5">
                                  <Tag className="h-2.5 w-2.5 text-gray-400" />
                                  <span className="text-[9px] text-gray-400">{lead.tags.slice(0, 3).join(", ")}{lead.tags.length > 3 ? ` +${lead.tags.length - 3}` : ""}</span>
                                </div>
                              )}

                              {/* Footer */}
                              <div className="flex items-center justify-between border-t border-gray-50 pt-1.5">
                                <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[9px] font-medium text-gray-500">{lead.source}</span>
                                <span className="flex items-center gap-1 text-[9px] text-gray-400">
                                  <Calendar className="h-2.5 w-2.5" />
                                  {new Date(lead.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Link>
                        <div
                          className="relative z-10 mt-1 px-2 pb-2"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <label className="mb-0.5 block text-[10px] font-medium text-gray-500 md:hidden">Move (no drag)</label>
                          <select
                            aria-label={`Change stage for ${name}`}
                            value={lead.commercial_stage}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (next === lead.commercial_stage) return;
                              stageMut.mutate({
                                id: lead.id,
                                stage: next,
                                expected_updated_at: lead.updated_at,
                              });
                            }}
                            className="w-full min-h-10 touch-manipulation rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-800 md:min-h-9 md:bg-white"
                          >
                            {PIPELINE_STAGES.map((s) => (
                              <option key={s.key} value={s.key}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                          <div className="mt-2 flex justify-end">
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
                        </div>
                      </div>
                    </div>
                  );
                })}
                {stageLeads.length === 0 && (
                  <div className={cn(
                    "flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-8 transition-colors",
                    isOver ? "border-blue-400 bg-blue-100/60" : "border-gray-200",
                  )}>
                    <p className="text-xs text-gray-400">No leads</p>
                    <p className="mt-1 text-[10px] text-gray-300">Drop a lead here</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
