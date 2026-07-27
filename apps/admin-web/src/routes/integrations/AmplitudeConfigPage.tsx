import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import { adminToast } from "@/lib/adminToast";

type AmplitudeData = {
  id?: string;
  environment?: string;
  api_key_public?: string | null;
  ingestion_endpoint?: string | null;
  enabled_client_portal?: boolean;
  enabled_provider_portal?: boolean;
  enabled_admin_portal?: boolean;
  guides_enabled?: boolean;
  surveys_enabled?: boolean;
  sampling_rate?: number | null;
  debug_mode?: boolean;
  updated_at?: string;
};

const BLANK: Omit<AmplitudeData, "id" | "updated_at"> = {
  api_key_public: "",
  ingestion_endpoint: "",
  enabled_client_portal: false,
  enabled_provider_portal: false,
  enabled_admin_portal: false,
  guides_enabled: false,
  surveys_enabled: false,
  sampling_rate: null,
  debug_mode: false,
};

export function AmplitudeConfigPage() {
  useAdminDocumentTitle("Amplitude");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_INTEGRATIONS_DEV,
    "Integrations & dev access is required."
  );
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const env = sp.get("environment") || "production";

  const [form, setForm] = useState<Omit<AmplitudeData, "id" | "updated_at">>(BLANK);
  const [editing, setEditing] = useState(false);
  const [secretKey, setSecretKey] = useState("");

  const q = useQuery({
    queryKey: adminQueryKeys.amplitude(env),
    queryFn: () =>
      adminApi.getJson<AmplitudeData | null>(
        `/api/admin/integrations/amplitude?environment=${encodeURIComponent(env)}`,
        { timeoutMs: 30_000 }
      ),
    enabled: allowed,
  });

  useEffect(() => {
    const d = q.data;
    if (d && !editing) {
      setForm({
        api_key_public: d.api_key_public ?? "",
        ingestion_endpoint: d.ingestion_endpoint ?? "",
        enabled_client_portal: d.enabled_client_portal ?? false,
        enabled_provider_portal: d.enabled_provider_portal ?? false,
        enabled_admin_portal: d.enabled_admin_portal ?? false,
        guides_enabled: d.guides_enabled ?? false,
        surveys_enabled: d.surveys_enabled ?? false,
        sampling_rate: d.sampling_rate ?? null,
        debug_mode: d.debug_mode ?? false,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.putJson(`/api/admin/integrations/amplitude`, body),
    onSuccess: () => {
      adminToast.success("Amplitude config saved");
      setEditing(false);
      setSecretKey("");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.amplitude(env) });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const handleSave = () => {
    const body: Record<string, unknown> = {
      ...form,
      environment: env,
    };
    if (secretKey.trim()) {
      body.api_key_server = secretKey.trim();
    }
    if (!body.api_key_public) {
      adminToast.error("Public API key is required");
      return;
    }
    saveMut.mutate(body);
  };

  const setEnv = (next: string) => {
    const n = new URLSearchParams(sp);
    n.set("environment", next);
    setSp(n, { replace: true });
    setEditing(false);
  };

  const toggle = (key: keyof typeof form) => {
    setForm((f) => ({ ...f, [key]: !f[key] }));
  };

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Amplitude" />
        <AdminPanel><AdminPageSkeleton rows={4} /></AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const d = q.data;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Amplitude"
        description="Configure Amplitude analytics for each portal and environment."
        actions={
          !editing ? (
            <button
              type="button"
              className={adminToolbarButtonClass(false) + " inline-flex items-center gap-2"}
              onClick={() => setEditing(true)}
            >
              <BarChart3 className="h-4 w-4" />
              {d ? "Edit config" : "Set up Amplitude"}
            </button>
          ) : null
        }
      />

      <AdminMutationAlert errors={[saveMut.error instanceof Error ? saveMut.error : null]} />

      {/* Env tabs */}
      <div className="flex gap-2">
        {["production", "staging"].map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEnv(e)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              env === e
                ? "bg-gray-900 text-white"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {e.charAt(0).toUpperCase() + e.slice(1)}
          </button>
        ))}
      </div>

      {/* Read-only view */}
      {!editing && (
        <AdminPanel>
          {!d ? (
            <p className="text-sm text-gray-500">
              No Amplitude configuration for <strong>{env}</strong>. Click "Set up Amplitude" to configure.
            </p>
          ) : (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Public API key</dt>
                <dd className="font-mono font-medium break-all">{d.api_key_public || "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Server API key</dt>
                <dd className="font-mono font-medium">{"***"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Ingestion endpoint</dt>
                <dd className="font-mono text-xs break-all">{d.ingestion_endpoint || "Default"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Sampling rate</dt>
                <dd>{d.sampling_rate != null ? `${d.sampling_rate}%` : "100% (default)"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="mb-2 text-gray-500">Enabled portals</dt>
                <dd className="flex flex-wrap gap-2">
                  {[
                    ["Customer", d.enabled_client_portal],
                    ["Provider", d.enabled_provider_portal],
                    ["Admin", d.enabled_admin_portal],
                    ["Guides", d.guides_enabled],
                    ["Surveys", d.surveys_enabled],
                    ["Debug", d.debug_mode],
                  ].map(([label, val]) => (
                    <span
                      key={String(label)}
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        val ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {label as string}: {val ? "On" : "Off"}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          )}
        </AdminPanel>
      )}

      {/* Edit form */}
      {editing && (
        <AdminPanel>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <BarChart3 className="h-4 w-4" />
            Configure Amplitude — {env}
          </h3>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Public API key *</label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={form.api_key_public ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, api_key_public: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Server API key <span className="text-gray-400">(leave blank to keep existing)</span>
              </label>
              <input
                type="password"
                autoComplete="off"
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Server-side only"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Ingestion endpoint</label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="https://api2.amplitude.com/2/httpapi (optional)"
                value={form.ingestion_endpoint ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, ingestion_endpoint: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Sampling rate (%)</label>
              <input
                type="number"
                min="1"
                max="100"
                className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="100"
                value={form.sampling_rate ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, sampling_rate: e.target.value ? Number(e.target.value) : null }))}
              />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Enable for portals</p>
              {([
                ["enabled_client_portal", "Customer portal"],
                ["enabled_provider_portal", "Provider portal"],
                ["enabled_admin_portal", "Admin portal"],
                ["guides_enabled", "Amplitude Guides"],
                ["surveys_enabled", "Amplitude Surveys"],
                ["debug_mode", "Debug mode"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 p-3">
                  <span className="text-sm text-gray-700">{label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!form[key]}
                    onClick={() => toggle(key)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${form[key] ? "bg-indigo-600" : "bg-gray-200"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${form[key] ? "translate-x-4" : "translate-x-0"}`} />
                  </button>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              className={adminToolbarButtonClass(saveMut.isPending)}
              disabled={saveMut.isPending}
              onClick={handleSave}
            >
              {saveMut.isPending ? "Saving…" : "Save config"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => { setEditing(false); setSecretKey(""); }}
            >
              Cancel
            </button>
          </div>
        </AdminPanel>
      )}
    </div>
  );
}
