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
import { useState, useEffect } from "react";
import { adminToast } from "@/lib/adminToast";

interface OpsSettings {
  stall_threshold_hours: number;
  dropoff_threshold_hours: number;
  auto_assign_enabled: boolean;
  auto_sms_on_stall: boolean;
  sla_contact_stalled_hours: number;
  sla_contact_dropped_hours: number;
}

export function ProviderOpsSettingsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_PROVIDER_OPS, "Provider Ops access is required.");
  const qc = useQueryClient();
  const [localSettings, setLocalSettings] = useState<OpsSettings | null>(null);

  const q = useQuery({
    queryKey: adminQueryKeys.providerOps.settings(),
    queryFn: () => adminApi.getJson<OpsSettings>("/api/admin/provider-ops/settings", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  useEffect(() => {
    if (q.data) setLocalSettings(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => adminApi.patchJson<OpsSettings>("/api/admin/provider-ops/settings", localSettings!),
    onSuccess: (res) => {
      setLocalSettings(res);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.settings() });
      adminToast.success("Settings saved");
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to save settings"),
  });

  const runStallCheck = useMutation({
    mutationFn: () => adminApi.postJson<{
      processed: number;
      stalled: number;
      dropped: number;
      on_track: number;
      sms_sent: number;
    }>("/api/admin/provider-ops/run-stall-check", {}),
    onSuccess: (res) => {
      adminToast.success(
        `Stall check complete — ${res.processed} drafts scanned: ${res.stalled} stalled, ${res.dropped} dropped, ${res.on_track} on track${res.sms_sent > 0 ? `, ${res.sms_sent} SMS sent` : ""}.`
      );
      void qc.invalidateQueries({ queryKey: adminQueryKeys.providerOps.all() });
    },
    onError: (err: Error) => adminToast.error(err.message || "Stall check failed"),
  });

  if (denied) return denied;
  if (q.isLoading) return <div className="space-y-6"><AdminPageHeader title="Provider Ops Settings" /><AdminPanel><AdminPageSkeleton rows={6} /></AdminPanel></div>;
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  if (!localSettings) return <AdminRetryBlock message="No settings" onRetry={() => void q.refetch()} />;

  function update(key: keyof OpsSettings, value: number | boolean) {
    setLocalSettings((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Provider Ops Settings"
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              disabled={runStallCheck.isPending}
              onClick={() => runStallCheck.mutate()}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title="Run stall detection now and update draft statuses"
            >
              {runStallCheck.isPending ? "Running…" : "Run stall check"}
            </button>
            <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
              {save.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        }
      />

      {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}

      <AdminPanel>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Stall Detection Thresholds</h2>
        <p className="mb-4 text-xs text-gray-500">Configure when signups are classified as slowing, stalled, or dropped off.</p>
        <div className="space-y-4">
          <NumberField label="Stall threshold (hours)" desc="Hours of inactivity before flagged as 'stalled'." value={localSettings.stall_threshold_hours} onChange={(v) => update("stall_threshold_hours", v)} min={1} />
          <NumberField label="Drop-off threshold (hours)" desc="Hours of inactivity before flagged as 'dropped off'." value={localSettings.dropoff_threshold_hours} onChange={(v) => update("dropoff_threshold_hours", v)} min={localSettings.stall_threshold_hours + 1} />
        </div>
      </AdminPanel>

      <AdminPanel>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Auto-Assignment</h2>
        <ToggleField label="Enable auto-assignment for stalled signups" desc="Automatically assign unassigned stalled signups to available ops admins." checked={localSettings.auto_assign_enabled} onChange={(v) => update("auto_assign_enabled", v)} />
      </AdminPanel>

      <AdminPanel>
        <h2 className="mb-4 text-base font-semibold text-gray-900">SLA & Notification Rules</h2>
        <p className="mb-4 text-xs text-gray-500">Define how quickly assigned admins should contact stalled or dropped signups.</p>
        <div className="space-y-4">
          <NumberField label="SLA: Contact stalled within (hours)" desc="Admin should contact stalled signups within this many hours." value={localSettings.sla_contact_stalled_hours} onChange={(v) => update("sla_contact_stalled_hours", v)} min={1} />
          <NumberField label="SLA: Contact dropped-off within (hours)" desc="Escalate if no admin contact within this many hours." value={localSettings.sla_contact_dropped_hours} onChange={(v) => update("sla_contact_dropped_hours", v)} min={1} />
          <ToggleField label="Send automated SMS on stall" desc="Automatically send a check-in SMS when a signup stalls. Requires Twilio." checked={localSettings.auto_sms_on_stall} onChange={(v) => update("auto_sms_on_stall", v)} />
        </div>
      </AdminPanel>
    </div>
  );
}

function NumberField({ label, desc, value, onChange, min }: { label: string; desc: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <p className="mb-1 text-xs text-gray-400">{desc}</p>
      <input type="number" value={value} min={min} onChange={(e) => onChange(parseInt(e.target.value) || 0)} className="w-32 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none" />
    </div>
  );
}

function ToggleField({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? "bg-gray-900" : "bg-gray-300"}`}>
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
    </div>
  );
}
