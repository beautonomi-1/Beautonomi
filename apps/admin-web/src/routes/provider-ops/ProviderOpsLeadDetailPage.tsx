import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
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

const STAGES = ["new", "contacted", "qualified", "proposal_sent", "negotiating", "won", "lost", "nurture", "matched"] as const;

export function ProviderOpsLeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const [noteText, setNoteText] = useState("");

  const q = useQuery({
    queryKey: adminQueryKeys.providerOps.leadDetail(id!),
    queryFn: () => adminApi.getJson<{ data: Record<string, unknown> }>(`/api/admin/provider-ops/leads/${id}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!id,
  });

  const activitiesQ = useQuery({
    queryKey: adminQueryKeys.providerOps.leadActivities(id!),
    queryFn: () => adminApi.getJson<{ data: Record<string, unknown>[] }>(`/api/admin/provider-ops/leads/${id}/activities`, { timeoutMs: 30_000 }),
    enabled: allowed && !!id,
  });

  const stageChange = useMutation({
    mutationFn: (stage: string) => adminApi.patchJson(`/api/admin/provider-ops/leads/${id}/stage`, { stage }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadDetail(id!) }),
  });

  const addNote = useMutation({
    mutationFn: () => adminApi.postJson(`/api/admin/provider-ops/leads/${id}/activities`, { activity_type: "note", description: noteText.trim() }),
    onSuccess: () => { setNoteText(""); void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.leadActivities(id!) }); },
  });

  const deleteLead = useMutation({
    mutationFn: () => adminApi.deleteJson(`/api/admin/provider-ops/leads/${id}`),
    onSuccess: () => navigate(adminSpaTo("/admin/provider-ops/leads")),
  });

  if (denied) return denied;
  if (q.isLoading) return <div className="space-y-6"><AdminPageHeader title="Lead Detail" /><AdminPanel><AdminPageSkeleton rows={8} /></AdminPanel></div>;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const lead = q.data?.data as Record<string, unknown> | undefined;
  if (!lead) return <AdminRetryBlock message="Lead not found" onRetry={() => void q.refetch()} />;

  const name = String(lead.business_name || lead.contact_person_name || lead.lead_name || "Unnamed Lead");
  const stage = String(lead.commercial_stage || "new");

  return (
    <div className="space-y-6">
      <Link to={adminSpaTo("/admin/provider-ops/leads")} className="text-sm text-gray-500 hover:text-gray-700">← Back to Leads</Link>

      <AdminPageHeader
        title={name}
        description={<span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{stage.replace(/_/g, " ")}</span>}
        actions={
          <button type="button" className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50" onClick={() => { if (confirm("Delete this lead?")) deleteLead.mutate(); }}>Delete</button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <AdminPanel>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Contact Information</h3>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Field label="Email" value={lead.email} />
              <Field label="Phone" value={lead.phone_e164} />
              <Field label="Contact Person" value={lead.contact_person_name} />
              <Field label="Business Name" value={lead.business_name} />
              <Field label="Location" value={lead.suggested_location_text} />
              <Field label="Country" value={lead.country} />
              <Field label="Source" value={lead.source} />
              <Field label="Created" value={lead.created_at ? new Date(String(lead.created_at)).toLocaleString() : null} />
            </dl>
          </AdminPanel>

          <AdminPanel>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Description & Notes</h3>
            <p className="text-sm text-gray-600">{String(lead.description ?? "No description provided")}</p>
            {lead.notes ? <p className="mt-2 text-sm text-gray-500 italic">{String(lead.notes)}</p> : null}
          </AdminPanel>

          <AdminPanel>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Activity Log</h3>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {(activitiesQ.data?.data ?? []).map((a, i) => (
                <div key={i} className="flex items-start gap-2 border-b pb-2 last:border-0">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-400" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700">{String((a as Record<string, unknown>).description || (a as Record<string, unknown>).activity_type)}</p>
                    <p className="text-xs text-gray-400">{(a as Record<string, unknown>).created_at ? new Date(String((a as Record<string, unknown>).created_at)).toLocaleString() : ""}</p>
                  </div>
                </div>
              ))}
              {(activitiesQ.data?.data ?? []).length === 0 && <p className="text-sm text-gray-400">No activities yet</p>}
            </div>

            <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row">
              <input type="text" placeholder="Add a note..." value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && noteText.trim() && addNote.mutate()} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <button type="button" disabled={!noteText.trim() || addNote.isPending} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" onClick={() => addNote.mutate()}>Add Note</button>
            </div>
          </AdminPanel>
        </div>

        <div className="space-y-6">
          <AdminPanel>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Change Stage</h3>
            <div className="flex flex-wrap gap-1">
              {STAGES.map((s) => (
                <button key={s} type="button" disabled={stageChange.isPending} onClick={() => stageChange.mutate(s)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${s === stage ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {s.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </AdminPanel>

          {Array.isArray(lead.tags) && (lead.tags as string[]).length > 0 ? (
            <AdminPanel>
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Tags</h3>
              <div className="flex flex-wrap gap-1">
                {(lead.tags as string[]).map((tag) => (
                  <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{tag}</span>
                ))}
              </div>
            </AdminPanel>
          ) : null}

          {typeof lead.matched_provider_id === "string" && lead.matched_provider_id ? (
            <AdminPanel className="!border-green-200 !bg-green-50">
              <h3 className="mb-1 text-sm font-semibold text-green-800">Matched Provider</h3>
              <Link to={adminSpaTo(`/admin/providers/${lead.matched_provider_id}`)} className="text-sm text-green-700 underline">View Provider →</Link>
            </AdminPanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800">{value ? String(value) : "—"}</dd>
    </div>
  );
}
