import { type MouseEvent } from "react";
import { Link } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { cn } from "@/lib/cn";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { LEAD_STAGE_OPTIONS, type LeadStageKey } from "@/lib/providerOpsLeadStages";
import { GripVertical, Mail, Phone, MapPin, Tag, Calendar, CheckSquare, Square } from "lucide-react";
import { LeadAssigneeInline } from "@/components/provider-ops/LeadAssigneeInline";

const PIPELINE_PAGE_SIZE = 120;
const OPS_PIPELINE_REFETCH_MS = 45_000;

interface LeadCategory {
  global_category_id: string;
  global_service_categories: { id: string; name: string; slug: string; icon: string | null } | null;
}

export interface PipelineLead {
  id: string;
  business_name: string | null;
  contact_person_name: string | null;
  email: string | null;
  phone_e164: string | null;
  commercial_stage: string;
  source: string;
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
  data: PipelineLead[];
  meta: { page: number; limit: number; total: number; has_more: boolean };
}

function WhatsAppStatusChip({ status }: { status?: PipelineLead["whatsapp_status"] }) {
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

function assigneeDisplayName(lead: PipelineLead): string {
  if (!lead.assigned_to) return "—";
  const u = lead.assigned_user;
  if (u && typeof u === "object") {
    const n = u.full_name?.trim() || "";
    const e = u.email?.trim() || "";
    if (n || e) return n || e;
  }
  return `${lead.assigned_to.slice(0, 8)}…`;
}

export function PipelineStageColumn({
  stage,
  filterQuery,
  stageCount,
  enabled,
  selectedIds,
  onToggleSelect,
  dragOverStage,
  draggedLeadId,
  landedLeadId,
  onDragOverStage,
  onDrop,
  onDragStart,
  onDragEnd,
  suppressCardClickRef,
  stageMut,
  assignLeadMut,
}: {
  stage: { key: LeadStageKey; label: string; description: string; color: string; dot: string };
  filterQuery: string;
  stageCount: number;
  enabled: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  dragOverStage: string | null;
  draggedLeadId: string | null;
  landedLeadId: string | null;
  onDragOverStage: (key: string | null) => void;
  onDrop: (targetStage: string, e: React.DragEvent) => void;
  onDragStart: (
    e: React.DragEvent,
    leadId: string,
    cardEl: HTMLElement,
    updatedAt?: string,
    fromStage?: string,
  ) => void;
  onDragEnd: () => void;
  suppressCardClickRef: React.MutableRefObject<boolean>;
  stageMut: {
    mutate: (args: { id: string; stage: string; expected_updated_at?: string }) => void;
    isPending: boolean;
    variables?: { id: string; stage: string; expected_updated_at?: string };
  };
  assignLeadMut: {
    mutate: (args: {
      leadId: string;
      assigned_to: string;
      assigned_to_name?: string;
      expected_updated_at?: string;
    }) => void;
    isPending: boolean;
    variables?: { leadId: string; assigned_to: string; assigned_to_name?: string; expected_updated_at?: string };
  };
}) {
  const qk = adminQueryKeys.providerOps.leads(`pipeline-col|${stage.key}|${filterQuery}`);

  const q = useInfiniteQuery({
    queryKey: qk,
    initialPageParam: 1,
    enabled,
    queryFn: ({ pageParam }) =>
      adminApi.getJson<LeadsPayload>(
        `/api/admin/provider-ops/leads?page=${pageParam}&limit=${PIPELINE_PAGE_SIZE}&stage=${encodeURIComponent(stage.key)}${filterQuery}`,
        { timeoutMs: 60_000 },
      ),
    getNextPageParam: (lastPage) => (lastPage.meta.has_more ? lastPage.meta.page + 1 : undefined),
    refetchInterval: OPS_PIPELINE_REFETCH_MS,
    refetchOnWindowFocus: true,
  });

  const stageLeads = q.data?.pages.flatMap((p) => p.data) ?? [];
  const isOver = dragOverStage === stage.key;

  return (
    <div
      className={cn(
        "flex w-[min(85vw,18rem)] max-w-sm flex-shrink-0 flex-col rounded-xl border-2 transition-all duration-150 sm:w-72",
        isOver
          ? "border-[3px] border-blue-500 bg-blue-100/70 shadow-xl ring-4 ring-blue-300/40 scale-[1.02]"
          : stage.color,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOverStage(stage.key);
      }}
      onDragLeave={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        onDragOverStage(null);
      }}
      onDrop={(ev) => onDrop(stage.key, ev)}
    >
      <div className="flex-shrink-0 rounded-t-[10px] border-b bg-white/70 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", stage.dot)} />
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{stage.label}</h3>
              <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-gray-500">{stage.description}</p>
            </div>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-bold",
              stageCount > 0 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500",
            )}
          >
            {stageCount}
          </span>
        </div>
        {q.hasNextPage ? (
          <button
            type="button"
            disabled={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {q.isFetchingNextPage ? "Loading…" : `Load more (${stageLeads.length} loaded)`}
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain p-2 [-webkit-overflow-scrolling:touch]">
        {q.isLoading ? (
          <p className="py-4 text-center text-xs text-gray-400">Loading…</p>
        ) : null}
        {stageLeads.map((lead) => {
          const name = lead.business_name || lead.contact_person_name || "Unnamed";
          const cats = (lead.provider_lead_categories ?? [])
            .map((c) => c.global_service_categories?.name)
            .filter(Boolean);
          const isDragging = draggedLeadId === lead.id;
          const isChecked = selectedIds.has(lead.id);
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
              <div className={cn("relative z-10", isDragging && "opacity-0")}>
                <div className="mb-1 flex items-center gap-1 px-1">
                  <button
                    type="button"
                    onClick={() => onToggleSelect(lead.id)}
                    className="text-gray-400 hover:text-gray-700"
                  >
                    {isChecked ? <CheckSquare className="h-3.5 w-3.5 text-blue-600" /> : <Square className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div
                  draggable
                  onDragStart={(e) =>
                    onDragStart(e, lead.id, e.currentTarget, lead.updated_at, lead.commercial_stage)
                  }
                  onDragEnd={onDragEnd}
                >
                  <Link
                    to={adminSpaTo(`/admin/provider-ops/leads/${lead.id}`)}
                    onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                      if (suppressCardClickRef.current) e.preventDefault();
                    }}
                    className="block"
                  >
                    <div
                      className={cn(
                        "group cursor-grab rounded-lg border bg-white transition-all duration-200 active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5",
                        landedLeadId === lead.id && "pipeline-card-land",
                      )}
                    >
                      <div className="flex items-center gap-1 border-b border-gray-50 px-3 py-2">
                        <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <p className="truncate text-sm font-medium text-gray-900">{name}</p>
                        </div>
                      </div>
                      <div className="space-y-1.5 px-3 pb-2.5 pt-1.5">
                        {lead.email && (
                          <div className="flex items-center gap-1.5 truncate text-[11px] text-gray-500">
                            <Mail className="h-3 w-3 flex-shrink-0 text-gray-400" />
                            {lead.email}
                          </div>
                        )}
                        {lead.phone_e164 && (
                          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                            <Phone className="h-3 w-3 flex-shrink-0 text-gray-400" />
                            {lead.phone_e164}
                            <WhatsAppStatusChip status={lead.whatsapp_status} />
                          </div>
                        )}
                        {lead.suggested_location_text && (
                          <div className="flex items-center gap-1.5 truncate text-[11px] text-gray-500">
                            <MapPin className="h-3 w-3 flex-shrink-0 text-gray-400" />
                            {lead.suggested_location_text}
                          </div>
                        )}
                        {cats.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {cats.slice(0, 2).map((c) => (
                              <span key={c} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-600">
                                {c}
                              </span>
                            ))}
                            {cats.length > 2 && <span className="text-[9px] text-gray-400">+{cats.length - 2}</span>}
                          </div>
                        )}
                        {lead.tags && lead.tags.length > 0 && (
                          <div className="flex items-center gap-1 pt-0.5">
                            <Tag className="h-2.5 w-2.5 text-gray-400" />
                            <span className="text-[9px] text-gray-400">
                              {lead.tags.slice(0, 3).join(", ")}
                              {lead.tags.length > 3 ? ` +${lead.tags.length - 3}` : ""}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between border-t border-gray-50 pt-1.5">
                          <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[9px] font-medium text-gray-500">
                            {lead.source}
                          </span>
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
                      {LEAD_STAGE_OPTIONS.map((s) => (
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
            </div>
          );
        })}
        {!q.isLoading && stageLeads.length === 0 && (
          <div
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-8 transition-colors",
              isOver ? "border-blue-400 bg-blue-100/60" : "border-gray-200",
            )}
          >
            <p className="text-xs text-gray-400">No leads</p>
            <p className="mt-1 text-[10px] text-gray-300">Drop a lead here</p>
          </div>
        )}
      </div>
    </div>
  );
}
