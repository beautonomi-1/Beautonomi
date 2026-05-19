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
import { adminToast } from "@/lib/adminToast";
import { cn } from "@/lib/cn";

interface TrackerUser {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  avatar_url: string | null;
  created_at: string | null;
}

interface TrackerDraft {
  id: string;
  current_step: number;
  current_step_name: string;
  draft_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface TrackerProvider {
  id: string;
  business_name: string | null;
  status: string | null;
  is_verified: boolean;
  created_at: string | null;
}

interface TrackerTracking {
  admin_assisted?: boolean | null;
  admin_notes?: string | null;
  assigned_to?: string | null;
  provider_id?: string | null;
  wizard_status?: string | null;
  updated_at?: string | null;
}

interface StepCompletion {
  completed: boolean;
  name: string;
  data_present: string[];
}

interface LinkedLead {
  id: string;
  business_name: string | null;
  commercial_stage: string | null;
  source: string | null;
  created_at: string | null;
}

interface TrackerDetailPayload {
  user: TrackerUser;
  draft: TrackerDraft | null;
  provider: TrackerProvider | null;
  tracking: TrackerTracking | null;
  step_completion: Record<string, StepCompletion>;
  linked_lead: LinkedLead | null;
}

interface ParsedNote {
  id: string;
  note: string;
  created_at: string | null;
  created_by_email: string | null;
}

export function ProviderOpsTrackerDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const [noteText, setNoteText] = useState("");

  const q = useQuery({
    queryKey: adminQueryKeys.providerOps.trackerDetail(userId!),
    queryFn: () => adminApi.getJson<{ data: TrackerDetailPayload }>(`/api/admin/provider-ops/tracker/${userId}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!userId,
  });

  const addNote = useMutation({
    mutationFn: () => adminApi.postJson(`/api/admin/provider-ops/tracker/${userId}/note`, { note: noteText.trim() }),
    onSuccess: () => {
      setNoteText("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.trackerDetail(userId!) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.trackerStats() });
      adminToast.success("Note added");
    },
    onError: (e: Error) => adminToast.error(`Failed to add note: ${e.message}`),
  });

  const submitOnboarding = useMutation({
    mutationFn: () => adminApi.postJson(`/api/admin/provider-ops/tracker/${userId}/submit`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.trackerDetail(userId!) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.navCounts() });
      adminToast.success("Onboarding submitted for activation review");
    },
    onError: (e: Error) => adminToast.error(`Submit failed: ${e.message}`),
  });

  if (denied) return denied;
  if (q.isLoading) return <div className="space-y-6"><AdminPageHeader title="Tracker Detail" /><AdminPanel><AdminPageSkeleton rows={8} /></AdminPanel></div>;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const d = q.data?.data;
  if (!d) return <AdminRetryBlock message="Not found" onRetry={() => void q.refetch()} />;

  const user = d.user;
  const draft = d.draft;
  const provider = d.provider;
  const tracking = d.tracking;
  const linkedLead = d.linked_lead;
  const draftData = draft?.draft_data ?? {};
  const name = user.full_name || String(draftData.owner_name || draftData.business_name || user.email || "Unknown User");
  const notes = parseAdminNotes(tracking?.admin_notes);
  const currentStep = draft?.current_step ?? 0;
  const stepRows = Object.entries(d.step_completion)
    .map(([step, value]) => ({ step: Number(step), ...value }))
    .sort((a, b) => a.step - b.step);
  const canSubmit = !provider && !!draft && Boolean(draftData.business_name);

  return (
    <div className="space-y-6">
      <Link to={adminSpaTo("/admin/provider-ops/tracker")} className="text-sm text-gray-500 hover:text-gray-700">← Back to Tracker</Link>

      <AdminPageHeader
        title={name}
        description={
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
            {user.email ? <span>{user.email}</span> : null}
            {user.phone ? <span>{user.phone}</span> : null}
            {user.created_at ? <span>Signed up {new Date(user.created_at).toLocaleDateString()}</span> : null}
            {provider ? <span>Provider: {provider.status || "created"}</span> : null}
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {provider ? (
              <Link to={adminSpaTo(`/admin/provider-ops/providers/${provider.id}`)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                View lifecycle
              </Link>
            ) : null}
            {!provider ? (
              <button
                type="button"
                disabled={submitOnboarding.isPending || !canSubmit}
                title={!draft ? "No onboarding draft found" : !draftData.business_name ? "Draft is missing business name" : undefined}
                onClick={() => { if (confirm("Submit onboarding on behalf of this user? This creates a provider in pending approval.")) submitOnboarding.mutate(); }}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitOnboarding.isPending ? "Submitting..." : "Submit Onboarding"}
              </button>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {draft && (
            <AdminPanel>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Onboarding Progress</h3>
              <div className="overflow-x-auto">
                <div className="grid min-w-[760px] grid-cols-7 gap-2 xl:min-w-0">
                  {stepRows.map((row) => (
                    <div
                      key={row.step}
                      className={cn(
                        "rounded-lg border p-2",
                        row.step === currentStep
                          ? "border-blue-300 bg-blue-50"
                          : row.completed
                            ? "border-green-200 bg-green-50"
                            : "border-gray-200 bg-gray-50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                          row.step === currentStep ? "bg-blue-600 text-white" : row.completed ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"
                        )}>
                          {row.step}
                        </span>
                        <span className="min-w-0 truncate text-xs font-medium text-gray-800">{row.name}</span>
                      </div>
                      {row.data_present.length > 0 ? (
                        <p className="mt-1 truncate text-[10px] text-gray-500">{row.data_present.join(", ")}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                Current step: {draft.current_step} — {draft.current_step_name}. Last saved {new Date(draft.updated_at).toLocaleString()}.
              </p>
            </AdminPanel>
          )}

          {draft && (
            <AdminPanel>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Draft Data</h3>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {Object.entries(draftData).map(([key, val]) => (
                  <div key={key}>
                    <dt className="text-xs text-gray-400">{key.replace(/_/g, " ")}</dt>
                    <dd className="break-words text-sm text-gray-800">{formatDraftValue(val)}</dd>
                  </div>
                ))}
              </dl>
            </AdminPanel>
          )}

          {!draft && (
            <AdminPanel>
              <p className="text-sm text-gray-600">No onboarding draft exists for this provider user yet.</p>
            </AdminPanel>
          )}
        </div>

        <div className="space-y-6">
          <AdminPanel>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Status</h3>
            <div className="space-y-2 text-sm">
              <StatusRow label="Wizard status" value={tracking?.wizard_status || (provider ? "submitted" : draft ? "in progress" : "not started")} />
              <StatusRow label="Admin assisted" value={tracking?.admin_assisted ? "Yes" : "No"} />
              <StatusRow label="Has provider" value={provider ? "Yes" : "No"} />
              <StatusRow label="Provider status" value={provider?.status || "—"} />
              <StatusRow label="Last activity" value={draft?.updated_at ? new Date(draft.updated_at).toLocaleString() : tracking?.updated_at ? new Date(tracking.updated_at).toLocaleString() : "—"} />
            </div>
          </AdminPanel>

          {provider && (
            <AdminPanel>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Provider Account</h3>
              <div className="space-y-2 text-sm">
                <StatusRow label="Business" value={provider.business_name || "—"} />
                <StatusRow label="Verified" value={provider.is_verified ? "Yes" : "No"} />
                <StatusRow label="Created" value={provider.created_at ? new Date(provider.created_at).toLocaleString() : "—"} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={adminSpaTo(`/admin/providers/${provider.id}`)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Admin provider view</Link>
                <Link to={adminSpaTo(`/admin/provider-ops/providers/${provider.id}`)} className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50">Lifecycle view</Link>
              </div>
            </AdminPanel>
          )}

          {linkedLead && (
            <AdminPanel>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Linked Lead</h3>
              <p className="text-sm font-medium text-gray-900">{linkedLead.business_name || "Unnamed lead"}</p>
              <p className="mt-1 text-xs text-gray-500">
                {linkedLead.commercial_stage || "—"} · {linkedLead.source || "—"}
              </p>
              <Link to={adminSpaTo(`/admin/provider-ops/leads/${linkedLead.id}`)} className="mt-3 inline-block text-xs font-medium text-blue-700 hover:underline">View lead</Link>
            </AdminPanel>
          )}

          <AdminPanel>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Admin Notes</h3>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {notes.map((n) => (
                <div key={n.id} className="border-b pb-2 last:border-0">
                  <p className="text-sm text-gray-700">{n.note}</p>
                  <p className="text-xs text-gray-400">
                    {n.created_by_email || "Admin"}
                    {n.created_at ? ` · ${new Date(n.created_at).toLocaleString()}` : ""}
                  </p>
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

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-800">{value}</span>
    </div>
  );
}

function parseAdminNotes(raw: string | null | undefined): ParsedNote[] {
  if (!raw?.trim()) return [];
  return raw
    .split("\n")
    .map((line, index) => {
      const match = line.match(/^\[([^\]]+)\]\s+([^:]+):\s*(.*)$/);
      if (!match) {
        return { id: `${index}`, note: line, created_at: null, created_by_email: null };
      }
      return {
        id: `${index}-${match[1]}`,
        created_at: match[1],
        created_by_email: match[2],
        note: match[3],
      };
    })
    .filter((n) => n.note.trim());
}

function formatDraftValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value
      .map((item) => {
        if (item == null) return "";
        if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return String(item);
        if (typeof item === "object" && "name" in item) return String((item as { name?: unknown }).name ?? "");
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join(", ");
  }
  return JSON.stringify(value);
}
