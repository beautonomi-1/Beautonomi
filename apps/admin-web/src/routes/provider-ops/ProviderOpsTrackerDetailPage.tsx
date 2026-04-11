import { useState } from "react";
import { Link, useParams } from "react-router-dom";
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

export function ProviderOpsTrackerDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const [noteText, setNoteText] = useState("");

  const q = useQuery({
    queryKey: adminQueryKeys.providerOps.trackerDetail(userId!),
    queryFn: () => adminApi.getJson<{ data: Record<string, unknown> }>(`/api/admin/provider-ops/tracker/${userId}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!userId,
  });

  const addNote = useMutation({
    mutationFn: () => adminApi.postJson(`/api/admin/provider-ops/tracker/${userId}/note`, { note: noteText.trim() }),
    onSuccess: () => { setNoteText(""); void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.trackerDetail(userId!) }); },
  });

  const submitOnboarding = useMutation({
    mutationFn: () => adminApi.postJson(`/api/admin/provider-ops/tracker/${userId}/submit`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.trackerDetail(userId!) }),
  });

  if (denied) return denied;
  if (q.isLoading) return <div className="space-y-6"><AdminPageHeader title="Tracker Detail" /><AdminPanel><AdminPageSkeleton rows={8} /></AdminPanel></div>;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const d = q.data?.data as Record<string, unknown> | undefined;
  if (!d) return <AdminRetryBlock message="Not found" onRetry={() => void q.refetch()} />;

  const name = String(d.full_name || d.email || "Unknown User");
  const info = d.info as Record<string, unknown> | undefined;
  const draft = d.draft as Record<string, unknown> | undefined;
  const notes = (d.notes as { id: string; note: string; created_at: string; created_by_email: string }[] | undefined) ?? [];

  return (
    <div className="space-y-6">
      <Link to={adminSpaTo("/admin/provider-ops/tracker")} className="text-sm text-gray-500 hover:text-gray-700">← Back to Tracker</Link>

      <AdminPageHeader
        title={name}
        description={
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
            {typeof d.email === "string" && d.email ? <span>{d.email}</span> : null}
            {typeof d.phone === "string" && d.phone ? <span>{d.phone}</span> : null}
            {typeof d.signup_date === "string" && d.signup_date ? <span>Signed up {new Date(d.signup_date).toLocaleDateString()}</span> : null}
          </div>
        }
        actions={
          !d.has_provider ? (
            <button type="button" disabled={submitOnboarding.isPending} onClick={() => { if (confirm("Submit onboarding on behalf of this user?")) submitOnboarding.mutate(); }}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              {submitOnboarding.isPending ? "Submitting..." : "Submit Onboarding"}
            </button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {info && (
            <AdminPanel>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Onboarding Progress</h3>
              <div className="overflow-x-auto">
                <div className="flex gap-0.5" style={{ minWidth: 420 }}>
                  {Array.from({ length: 14 }, (_, i) => i + 1).map((step) => {
                    const current = Number(d.current_step ?? 0);
                    return (
                      <div key={step} className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${step < current ? "bg-green-400 text-white" : step === current ? "bg-blue-500 text-white ring-2 ring-blue-200" : "bg-gray-200 text-gray-400"}`}>
                        {step}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">Current step: {String(d.current_step)} — {String(d.current_step_name || "")}</p>
            </AdminPanel>
          )}

          {draft && (
            <AdminPanel>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Draft Data</h3>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {Object.entries(draft).map(([key, val]) => (
                  <div key={key}>
                    <dt className="text-xs text-gray-400">{key.replace(/_/g, " ")}</dt>
                    <dd className="text-sm text-gray-800">{val != null ? String(val) : "—"}</dd>
                  </div>
                ))}
              </dl>
            </AdminPanel>
          )}
        </div>

        <div className="space-y-6">
          <AdminPanel>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Stall status</span><span className="font-medium text-gray-800">{String(d.stall_status || "—")}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Admin assisted</span><span className="font-medium text-gray-800">{d.admin_assisted ? "Yes" : "No"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Has provider</span><span className="font-medium text-gray-800">{d.has_provider ? "Yes" : "No"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Last activity</span><span className="font-medium text-gray-800">{d.last_activity ? new Date(String(d.last_activity)).toLocaleString() : "—"}</span></div>
            </div>
          </AdminPanel>

          <AdminPanel>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Admin Notes</h3>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {notes.map((n) => (
                <div key={n.id} className="border-b pb-2 last:border-0">
                  <p className="text-sm text-gray-700">{n.note}</p>
                  <p className="text-xs text-gray-400">{n.created_by_email} · {new Date(n.created_at).toLocaleString()}</p>
                </div>
              ))}
              {notes.length === 0 && <p className="text-sm text-gray-400">No notes yet</p>}
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row">
              <input type="text" placeholder="Add a note..." value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && noteText.trim() && addNote.mutate()} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <button type="button" disabled={!noteText.trim() || addNote.isPending} className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:w-auto" onClick={() => addNote.mutate()}>Add Note</button>
            </div>
          </AdminPanel>
        </div>
      </div>
    </div>
  );
}
