import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "@/lib/adminClient";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { CpBack, CpField } from "./cpShared";

const ROLES = ["__any__", "superadmin", "provider_owner", "provider_staff", "customer"] as const;
const PLATFORMS = ["web", "customer", "provider"] as const;
const ENVS = ["production", "staging", "development"] as const;

export function CpFeatureFlagsPage() {
  const { allowed, denied } = useSuperadminPage("Control plane is superadmin-only.");
  const [flags, setFlags] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<Record<string, { enabled: boolean }> | null>(null);
  const [previewForm, setPreviewForm] = useState({
    user_id: "",
    role: "",
    platform: "web",
    environment: "production",
    app_version: "",
  });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await adminApi.getJson<Array<Record<string, unknown>>>("/api/admin/feature-flags");
        if (!cancelled) setFlags(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load");
          setFlags([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const runPreview = async () => {
    setPreviewLoading(true);
    setErr(null);
    try {
      const payload = await adminApi.postJson<{
        resolved: Record<string, { enabled: boolean }>;
      }>("/api/admin/control-plane/flags-preview", {
        user_id: previewForm.user_id || undefined,
        role: previewForm.role || undefined,
        platform: previewForm.platform,
        environment: previewForm.environment,
        app_version: previewForm.app_version || undefined,
      });
      setPreview(payload?.resolved ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Preview failed");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  if (denied) return denied;

  return (
    <div className="space-y-6">
      <CpBack />
      <AdminPageHeader
        title="Feature Flag Resolver"
        description="Environment-level resolver: preview exactly which flags are active for a given user, role, platform, and environment. Read-only — to create or toggle flags, go to Feature Flags under Platform &amp; Access."
      />
      {err ? (
        <AdminPanel>
          <p className="text-sm text-red-600">{err}</p>
        </AdminPanel>
      ) : null}
      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">Preview resolver</h2>
        <p className="mt-1 text-sm text-gray-600">Resolve flags for a user/role/platform/environment.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <CpField label="User ID (optional)">
            <input
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={previewForm.user_id}
              onChange={(e) => setPreviewForm((p) => ({ ...p, user_id: e.target.value }))}
              placeholder="uuid"
            />
          </CpField>
          <CpField label="Role">
            <select
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={previewForm.role || "__any__"}
              onChange={(e) =>
                setPreviewForm((p) => ({ ...p, role: e.target.value === "__any__" ? "" : e.target.value }))
              }
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r === "__any__" ? "Any" : r}
                </option>
              ))}
            </select>
          </CpField>
          <CpField label="Platform">
            <select
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={previewForm.platform}
              onChange={(e) => setPreviewForm((p) => ({ ...p, platform: e.target.value }))}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </CpField>
          <CpField label="Environment">
            <select
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={previewForm.environment}
              onChange={(e) => setPreviewForm((p) => ({ ...p, environment: e.target.value }))}
            >
              {ENVS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </CpField>
          <CpField label="App version (optional)">
            <input
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={previewForm.app_version}
              onChange={(e) => setPreviewForm((p) => ({ ...p, app_version: e.target.value }))}
              placeholder="1.0.0"
            />
          </CpField>
        </div>
        <button
          type="button"
          className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={() => void runPreview()}
          disabled={previewLoading}
        >
          {previewLoading ? "Resolving…" : "Resolve"}
        </button>
        {preview ? (
          <div className="mt-4 flex flex-wrap gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
            {Object.entries(preview).map(([key, v]) => (
              <span
                key={key}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  v.enabled ? "bg-primary/15 text-primary" : "bg-gray-200 text-gray-700"
                }`}
              >
                {key}: {v.enabled ? "on" : "off"}
              </span>
            ))}
          </div>
        ) : null}
      </AdminPanel>

      <AdminPanel>
        <h2 className="text-lg font-semibold text-gray-900">All flags (read-only)</h2>
        <p className="mt-1 text-sm text-gray-600">
          Edit on{" "}
          <Link to={adminSpaTo("/admin/settings/feature-flags")} className="font-medium text-primary underline">
            Feature flags
          </Link>
          .
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-gray-500">Loading…</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {flags.map((f) => (
              <li key={String(f.id)} className="flex flex-wrap items-center gap-2 border-b border-gray-100 py-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    f.enabled ? "bg-primary/15 text-primary" : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {String(f.feature_key)}
                </span>
                <span className="text-gray-500">
                  rollout={Number(f.rollout_percent ?? 100)}%
                  {Array.isArray(f.platforms_allowed) && (f.platforms_allowed as string[]).length
                    ? ` · platforms=${(f.platforms_allowed as string[]).join(",")}`
                    : ""}
                  {Array.isArray(f.roles_allowed) && (f.roles_allowed as string[]).length
                    ? ` · roles=${(f.roles_allowed as string[]).join(",")}`
                    : ""}
                  {f.min_app_version ? ` · min=${String(f.min_app_version)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>
    </div>
  );
}
