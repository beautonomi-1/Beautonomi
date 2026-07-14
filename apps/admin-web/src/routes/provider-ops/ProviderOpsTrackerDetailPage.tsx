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

interface DraftEditForm {
  business_name: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  description: string;
  team_size: string;
  address_line1: string;
  address_line2: string;
  address_city: string;
  address_state: string;
  address_postal_code: string;
  address_country: string;
}

const TEAM_SIZE_OPTIONS = [
  { value: "", label: "—" },
  { value: "freelancer", label: "Freelancer" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

const EDITABLE_DRAFT_TOP_LEVEL_KEYS = new Set([
  "business_name",
  "owner_name",
  "owner_email",
  "owner_phone",
  "description",
  "team_size",
  "address",
]);

const DRAFT_INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none";

export function ProviderOpsTrackerDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const qc = useQueryClient();
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const [noteText, setNoteText] = useState("");
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [draftEditForm, setDraftEditForm] = useState<DraftEditForm>(emptyDraftEditForm());

  const q = useQuery({
    queryKey: adminQueryKeys.providerOps.trackerDetail(userId!),
    queryFn: () => adminApi.getJson<TrackerDetailPayload>(`/api/admin/provider-ops/tracker/${userId}`, { timeoutMs: 60_000 }),
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

  const saveDraftMut = useMutation({
    mutationFn: (draft_data: Record<string, unknown>) =>
      adminApi.patchJson(`/api/admin/provider-ops/tracker/${userId}/draft`, { draft_data }),
    onSuccess: () => {
      setIsEditingDraft(false);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.trackerDetail(userId!) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.trackerStats() });
      adminToast.success("Draft updated");
    },
    onError: (e: Error) => adminToast.error(`Failed to save draft: ${e.message}`),
  });

  if (denied) return denied;
  if (q.isLoading) return <div className="space-y-6"><AdminPageHeader title="Tracker Detail" /><AdminPanel><AdminPageSkeleton rows={8} /></AdminPanel></div>;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const d = q.data;
  if (!d?.user) return <AdminRetryBlock message="Not found" onRetry={() => void q.refetch()} />;

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
  const lifecycleBadge = deriveLifecycleBadge(provider, draft);
  const otherDraftEntries = Object.entries(draftData).filter(([key]) => !EDITABLE_DRAFT_TOP_LEVEL_KEYS.has(key));

  function startDraftEditing() {
    setDraftEditForm(buildDraftEditForm(draftData));
    setIsEditingDraft(true);
  }

  function cancelDraftEditing() {
    setIsEditingDraft(false);
  }

  function saveDraftEdits() {
    const changes = buildDraftSavePayload(draftData, draftEditForm);
    if (!changes) {
      setIsEditingDraft(false);
      return;
    }
    saveDraftMut.mutate(changes);
  }

  return (
    <div className="space-y-6">
      <Link to={adminSpaTo("/admin/provider-ops/tracker")} className="text-sm text-gray-500 hover:text-gray-700">← Back to Tracker</Link>

      <AdminPageHeader
        title={name}
        description={
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", lifecycleBadge.cls)}>
              {lifecycleBadge.label}
            </span>
            {user.email ? <span>{user.email}</span> : null}
            {user.phone ? <span>{user.phone}</span> : null}
            {user.created_at ? <span>Signed up {new Date(user.created_at).toLocaleDateString()}</span> : null}
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
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-700">Draft Data</h3>
                {!isEditingDraft ? (
                  <button
                    type="button"
                    onClick={startDraftEditing}
                    className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                  >
                    Edit
                  </button>
                ) : null}
              </div>

              {isEditingDraft ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DraftFieldInput
                      label="Business name"
                      value={draftEditForm.business_name}
                      onChange={(v) => setDraftEditForm((f) => ({ ...f, business_name: v }))}
                    />
                    <DraftFieldInput
                      label="Owner name"
                      value={draftEditForm.owner_name}
                      onChange={(v) => setDraftEditForm((f) => ({ ...f, owner_name: v }))}
                    />
                    <DraftFieldInput
                      label="Owner email"
                      type="email"
                      value={draftEditForm.owner_email}
                      onChange={(v) => setDraftEditForm((f) => ({ ...f, owner_email: v }))}
                    />
                    <DraftFieldInput
                      label="Owner phone"
                      type="tel"
                      value={draftEditForm.owner_phone}
                      onChange={(v) => setDraftEditForm((f) => ({ ...f, owner_phone: v }))}
                    />
                    <label className="block text-sm sm:col-span-2">
                      <span className="text-xs font-medium text-gray-500">Team size</span>
                      <select
                        className={DRAFT_INPUT_CLASS}
                        value={draftEditForm.team_size}
                        onChange={(e) => setDraftEditForm((f) => ({ ...f, team_size: e.target.value }))}
                      >
                        {TEAM_SIZE_OPTIONS.map((opt) => (
                          <option key={opt.value || "unset"} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="block text-sm">
                    <span className="text-xs font-medium text-gray-500">Description</span>
                    <textarea
                      rows={3}
                      className={DRAFT_INPUT_CLASS}
                      value={draftEditForm.description}
                      onChange={(e) => setDraftEditForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </label>

                  <div>
                    <p className="mb-2 text-xs font-medium text-gray-500">Address</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <DraftFieldInput
                        label="Line 1"
                        value={draftEditForm.address_line1}
                        onChange={(v) => setDraftEditForm((f) => ({ ...f, address_line1: v }))}
                      />
                      <DraftFieldInput
                        label="Line 2"
                        value={draftEditForm.address_line2}
                        onChange={(v) => setDraftEditForm((f) => ({ ...f, address_line2: v }))}
                      />
                      <DraftFieldInput
                        label="City"
                        value={draftEditForm.address_city}
                        onChange={(v) => setDraftEditForm((f) => ({ ...f, address_city: v }))}
                      />
                      <DraftFieldInput
                        label="State / province"
                        value={draftEditForm.address_state}
                        onChange={(v) => setDraftEditForm((f) => ({ ...f, address_state: v }))}
                      />
                      <DraftFieldInput
                        label="Postal code"
                        value={draftEditForm.address_postal_code}
                        onChange={(v) => setDraftEditForm((f) => ({ ...f, address_postal_code: v }))}
                      />
                      <DraftFieldInput
                        label="Country"
                        value={draftEditForm.address_country}
                        onChange={(v) => setDraftEditForm((f) => ({ ...f, address_country: v }))}
                      />
                    </div>
                  </div>

                  {otherDraftEntries.length > 0 ? (
                    <div className="border-t pt-3">
                      <p className="mb-2 text-xs font-medium text-gray-500">Other fields (read-only)</p>
                      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                        {otherDraftEntries.map(([key, val]) => (
                          <div key={key}>
                            <dt className="text-xs text-gray-400">{key.replace(/_/g, " ")}</dt>
                            <dd className="break-words text-sm text-gray-800">{formatDraftValue(val)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}

                  <div className="flex gap-2 border-t pt-3">
                    <button
                      type="button"
                      disabled={saveDraftMut.isPending}
                      onClick={saveDraftEdits}
                      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      {saveDraftMut.isPending ? "Saving…" : "Save Changes"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelDraftEditing}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <DraftFieldDisplay label="Business name" value={draftData.business_name} />
                    <DraftFieldDisplay label="Owner name" value={draftData.owner_name} />
                    <DraftFieldDisplay label="Owner email" value={draftData.owner_email} />
                    <DraftFieldDisplay label="Owner phone" value={draftData.owner_phone} />
                    <DraftFieldDisplay label="Team size" value={draftData.team_size} />
                    <DraftFieldDisplay label="Description" value={draftData.description} className="sm:col-span-2" />
                    <DraftFieldDisplay label="Address line 1" value={getDraftAddressPart(draftData, "line1")} />
                    <DraftFieldDisplay label="Address line 2" value={getDraftAddressPart(draftData, "line2")} />
                    <DraftFieldDisplay label="City" value={getDraftAddressPart(draftData, "city")} />
                    <DraftFieldDisplay label="State / province" value={getDraftAddressPart(draftData, "state")} />
                    <DraftFieldDisplay label="Postal code" value={getDraftAddressPart(draftData, "postal_code")} />
                    <DraftFieldDisplay label="Country" value={getDraftAddressPart(draftData, "country")} />
                  </dl>

                  {otherDraftEntries.length > 0 ? (
                    <dl className="mt-4 grid grid-cols-1 gap-3 border-t pt-4 text-sm sm:grid-cols-2">
                      {otherDraftEntries.map(([key, val]) => (
                        <div key={key}>
                          <dt className="text-xs text-gray-400">{key.replace(/_/g, " ")}</dt>
                          <dd className="break-words text-sm text-gray-800">{formatDraftValue(val)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </>
              )}
            </AdminPanel>
          )}

          {!draft && provider && (
            <AdminPanel className="!border-green-200 !bg-green-50/40">
              <h3 className="mb-2 text-sm font-semibold text-green-800">Onboarding complete</h3>
              <p className="text-sm text-green-700">
                {name} finished onboarding and a provider account was created
                {provider.status ? ` (status: ${provider.status.replace(/_/g, " ")})` : ""}.
                There is no in-progress onboarding draft associated with this provider
                (drafts are cleared once onboarding is submitted).
              </p>
              <p className="mt-2 text-xs text-green-600">
                Use the Provider Account panel to open the lifecycle or admin provider view.
              </p>
            </AdminPanel>
          )}

          {!draft && !provider && (
            <AdminPanel>
              <p className="text-sm text-gray-600">
                This user has signed up but hasn&apos;t started the onboarding wizard yet —
                no draft has been saved.
              </p>
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

/** At-a-glance onboarding lifecycle badge derived from provider + draft state. */
function deriveLifecycleBadge(
  provider: TrackerProvider | null,
  draft: TrackerDraft | null,
): { label: string; cls: string } {
  if (provider) {
    const status = provider.status ?? "";
    if (status === "active") return { label: "Active", cls: "bg-green-100 text-green-700" };
    if (status === "pending_approval")
      return { label: "Pending approval", cls: "bg-amber-100 text-amber-700" };
    if (status === "suspended") return { label: "Suspended", cls: "bg-red-100 text-red-700" };
    return {
      label: status ? status.replace(/_/g, " ") : "Provider created",
      cls: "bg-teal-100 text-teal-700",
    };
  }
  if (draft) return { label: "In progress", cls: "bg-blue-100 text-blue-700" };
  return { label: "Not started", cls: "bg-gray-100 text-gray-600" };
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

function emptyDraftEditForm(): DraftEditForm {
  return {
    business_name: "",
    owner_name: "",
    owner_email: "",
    owner_phone: "",
    description: "",
    team_size: "",
    address_line1: "",
    address_line2: "",
    address_city: "",
    address_state: "",
    address_postal_code: "",
    address_country: "",
  };
}

function buildDraftEditForm(data: Record<string, unknown>): DraftEditForm {
  const addr = (data.address as Record<string, unknown> | undefined) ?? {};
  return {
    business_name: String(data.business_name ?? ""),
    owner_name: String(data.owner_name ?? ""),
    owner_email: String(data.owner_email ?? ""),
    owner_phone: String(data.owner_phone ?? ""),
    description: String(data.description ?? ""),
    team_size: String(data.team_size ?? ""),
    address_line1: String(addr.line1 ?? ""),
    address_line2: String(addr.line2 ?? ""),
    address_city: String(addr.city ?? ""),
    address_state: String(addr.state ?? ""),
    address_postal_code: String(addr.postal_code ?? ""),
    address_country: String(addr.country ?? ""),
  };
}

function buildDraftSavePayload(
  original: Record<string, unknown>,
  form: DraftEditForm,
): Record<string, unknown> | null {
  const changes: Record<string, unknown> = {};

  const scalarFields = [
    "business_name",
    "owner_name",
    "owner_email",
    "owner_phone",
    "description",
  ] as const;
  for (const field of scalarFields) {
    if (form[field] !== String(original[field] ?? "")) {
      changes[field] = form[field] || null;
    }
  }

  if (form.team_size !== String(original.team_size ?? "")) {
    changes.team_size = form.team_size || null;
  }

  const origAddr = (original.address as Record<string, unknown> | undefined) ?? {};
  const addressFields = [
    ["line1", form.address_line1],
    ["line2", form.address_line2],
    ["city", form.address_city],
    ["state", form.address_state],
    ["postal_code", form.address_postal_code],
    ["country", form.address_country],
  ] as const;
  const addressChanged = addressFields.some(
    ([key, value]) => value !== String(origAddr[key] ?? ""),
  );
  if (addressChanged) {
    changes.address = {
      ...origAddr,
      line1: form.address_line1,
      line2: form.address_line2 || undefined,
      city: form.address_city,
      state: form.address_state,
      postal_code: form.address_postal_code,
      country: form.address_country,
    };
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

function getDraftAddressPart(data: Record<string, unknown>, key: string): unknown {
  const addr = data.address;
  if (!addr || typeof addr !== "object") return undefined;
  return (addr as Record<string, unknown>)[key];
}

function DraftFieldInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input
        type={type}
        className={DRAFT_INPUT_CLASS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function DraftFieldDisplay({
  label,
  value,
  className,
}: {
  label: string;
  value: unknown;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="break-words text-sm text-gray-800">{formatDraftValue(value)}</dd>
    </div>
  );
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
