import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { adminSpaTo } from "@/lib/adminSpaPath";
import { adminToast } from "@/lib/adminToast";

const PIPELINE_STAGES = [
  { key: "new", label: "New", color: "border-blue-300 bg-blue-50" },
  { key: "contacted", label: "Contacted", color: "border-cyan-300 bg-cyan-50" },
  { key: "qualified", label: "Qualified", color: "border-emerald-300 bg-emerald-50" },
  { key: "proposal_sent", label: "Proposal Sent", color: "border-violet-300 bg-violet-50" },
  { key: "negotiating", label: "Negotiating", color: "border-purple-300 bg-purple-50" },
  { key: "won", label: "Won", color: "border-green-300 bg-green-50" },
] as const;

interface Lead { id: string; business_name: string | null; contact_person_name: string | null; email: string | null; phone_e164: string | null; commercial_stage: string; source: string; created_at: string }

export function ProviderOpsPipelinePage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const qc = useQueryClient();
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);

  const qk = adminQueryKeys.providerOps.leads("pipeline-all");
  const q = useQuery({
    queryKey: qk,
    queryFn: () => adminApi.getJson<{ data: Lead[] }>("/api/admin/provider-ops/leads?limit=500", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const leads = q.data?.data ?? [];

  const stageMut = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      adminApi.patchJson(`/api/admin/provider-ops/leads/${id}/stage`, { stage }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
    },
    onError: (e: Error) => adminToast.error(`Stage update failed: ${e.message}`),
  });

  function handleDrop(targetStage: string) {
    setDragOverStage(null);
    if (!draggedLeadId) return;
    const lead = leads.find((l) => l.id === draggedLeadId);
    if (!lead || lead.commercial_stage === targetStage) { setDraggedLeadId(null); return; }
    setDraggedLeadId(null);
    stageMut.mutate({ id: lead.id, stage: targetStage });
  }

  if (denied) return denied;
  if (q.isLoading) return <div className="space-y-6"><AdminPageHeader title="Pipeline Board" /><AdminPanel><AdminPageSkeleton rows={6} /></AdminPanel></div>;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Pipeline Board" description="Drag leads between stages to update their status" />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.commercial_stage === stage.key);
          const isOver = dragOverStage === stage.key;
          return (
            <div
              key={stage.key}
              className={`w-72 flex-shrink-0 rounded-xl border-2 transition-colors ${isOver ? "border-blue-400 bg-blue-50/50" : stage.color}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.key); }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={() => handleDrop(stage.key)}
            >
              <div className="rounded-t-xl border-b bg-white/60 p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">{stage.label}</h3>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{stageLeads.length}</span>
                </div>
              </div>
              <div className="min-h-[200px] max-h-[calc(100vh-280px)] space-y-2 overflow-y-auto p-2">
                {stageLeads.map((lead) => {
                  const name = lead.business_name || lead.contact_person_name || "Unnamed";
                  return (
                    <Link key={lead.id} to={adminSpaTo(`/admin/provider-ops/leads/${lead.id}`)}>
                      <div
                        draggable
                        onDragStart={() => setDraggedLeadId(lead.id)}
                        className="cursor-grab rounded-lg border bg-white p-3 transition-shadow hover:shadow-md active:cursor-grabbing"
                      >
                        <p className="truncate text-sm font-medium text-gray-800">{name}</p>
                        <div className="mt-1 flex flex-col gap-0.5">
                          {lead.email && <span className="truncate text-[10px] text-gray-400">{lead.email}</span>}
                          {lead.phone_e164 && <span className="text-[10px] text-gray-400">{lead.phone_e164}</span>}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[9px] text-gray-500">{lead.source}</span>
                          <span className="text-[9px] text-gray-300">{new Date(lead.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {stageLeads.length === 0 && <div className="py-8 text-center text-xs text-gray-400">No leads</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
