import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Map, Key } from "lucide-react";
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

interface MapboxConfig {
  id?: string;
  public_access_token?: string | null;
  access_token?: string;
  style_url?: string | null;
  is_enabled?: boolean;
  updated_at?: string;
  [key: string]: unknown;
}

const BLANK_FORM = { public_access_token: "", access_token: "", style_url: "", is_enabled: true };

export function MapboxConfigPage() {
  useAdminDocumentTitle("Mapbox");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_INTEGRATIONS_DEV,
    "Integrations access is required."
  );
  const qc = useQueryClient();

  const [form, setForm] = useState(BLANK_FORM);
  const [editing, setEditing] = useState(false);

  const q = useQuery({
    queryKey: adminQueryKeys.mapboxConfig(),
    queryFn: () => adminApi.getJson<MapboxConfig | null>("/api/admin/mapbox/config", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  useEffect(() => {
    const d = q.data;
    if (d && !editing) {
      setForm({
        public_access_token: (d.public_access_token as string) ?? "",
        access_token: "",
        style_url: (d.style_url as string) ?? "",
        is_enabled: (d.is_enabled as boolean) ?? true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminApi.putJson("/api/admin/mapbox/config", body),
    onSuccess: () => {
      adminToast.success("Mapbox config saved");
      setEditing(false);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.mapboxConfig() });
    },
    onError: (e: Error) => adminToast.error(e.message),
  });

  const handleSave = () => {
    const body: Record<string, unknown> = {
      public_access_token: form.public_access_token.trim() || null,
      style_url: form.style_url.trim() || null,
      is_enabled: form.is_enabled,
    };
    if (form.access_token.trim() && form.access_token.trim() !== "***") {
      body.access_token = form.access_token.trim();
    }
    saveMut.mutate(body);
  };

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Mapbox" />
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
        title="Mapbox"
        description="Configure map tokens and style for address autocomplete and service-zone maps."
        actions={
          !editing ? (
            <button
              type="button"
              className={adminToolbarButtonClass(false) + " inline-flex items-center gap-2"}
              onClick={() => setEditing(true)}
            >
              <Map className="h-4 w-4" />
              {d ? "Edit config" : "Set up Mapbox"}
            </button>
          ) : null
        }
      />

      <AdminMutationAlert errors={[saveMut.error instanceof Error ? saveMut.error : null]} />

      {/* Current config read-only */}
      {!editing && (
        <AdminPanel>
          {!d ? (
            <p className="text-sm text-gray-500">No Mapbox configuration set. Click "Set up Mapbox" to get started.</p>
          ) : (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Public access token</dt>
                <dd className="font-mono font-medium break-all">{d.public_access_token ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Secret access token</dt>
                <dd className="font-mono font-medium">{d.access_token ?? "***"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Style URL</dt>
                <dd className="font-mono text-xs break-all">{(d.style_url as string) || "Default"}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    d.is_enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
                  }`}>
                    {d.is_enabled ? "Enabled" : "Disabled"}
                  </span>
                </dd>
              </div>
              {d.updated_at && (
                <div className="sm:col-span-2">
                  <dt className="text-gray-500">Last updated</dt>
                  <dd>{new Date(d.updated_at as string).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          )}
        </AdminPanel>
      )}

      {/* Edit form */}
      {editing && (
        <AdminPanel>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Key className="h-4 w-4" />
            {d ? "Edit Mapbox configuration" : "Configure Mapbox"}
          </h3>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Public access token <span className="text-gray-400">(pk.ey...)</span>
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="pk.eyJ1Ij..."
                value={form.public_access_token}
                onChange={(e) => setForm((f) => ({ ...f, public_access_token: e.target.value }))}
              />
              <p className="text-xs text-gray-400">Used in the browser for maps and geocoding.</p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Secret access token <span className="text-gray-400">(sk.ey... — stored securely)</span>
              </label>
              <input
                type="password"
                autoComplete="off"
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Leave blank to keep existing"
                value={form.access_token}
                onChange={(e) => setForm((f) => ({ ...f, access_token: e.target.value }))}
              />
              <p className="text-xs text-gray-400">Used server-side only. Never exposed to clients.</p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Map style URL</label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="mapbox://styles/..."
                value={form.style_url}
                onChange={(e) => setForm((f) => ({ ...f, style_url: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Enable Mapbox</p>
                <p className="text-xs text-gray-400 mt-0.5">Disabling will fall back to default map behaviour.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.is_enabled}
                onClick={() => setForm((f) => ({ ...f, is_enabled: !f.is_enabled }))}
                className={`relative inline-flex h-6 w-11 cursor-pointer rounded-full border-2 border-transparent transition-colors ${form.is_enabled ? "bg-indigo-600" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${form.is_enabled ? "translate-x-5" : "translate-x-0"}`} />
              </button>
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
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </AdminPanel>
      )}
    </div>
  );
}
