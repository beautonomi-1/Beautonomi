import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@beautonomi/admin-access";
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

type FullSettings = Record<string, unknown>;

type BrandingForm = {
  site_name: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
};

type LocalizationForm = {
  default_language: string;
  default_currency: string;
  timezone: string;
};

type FeaturesForm = {
  auto_approve_providers: boolean;
};

function inp(
  label: string,
  value: string,
  onChange: (v: string) => void,
  type = "text"
) {
  return (
    <div key={label}>
      <label className="mb-0.5 block text-xs font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );
}

export function GeneralSettingsPage() {
  useAdminDocumentTitle("Platform Settings");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required."
  );
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.settings(),
    queryFn: () => adminApi.getJson<FullSettings>("/api/admin/settings", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const [branding, setBranding] = useState<BrandingForm>({
    site_name: "",
    logo_url: "",
    favicon_url: "",
    primary_color: "#6366f1",
    secondary_color: "#f59e0b",
  });
  const [localization, setLocalization] = useState<LocalizationForm>({
    default_language: "en",
    default_currency: "ZAR",
    timezone: "Africa/Johannesburg",
  });
  const [features, setFeatures] = useState<FeaturesForm>({
    auto_approve_providers: false,
  });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) return;
    const b = (q.data.branding ?? {}) as Partial<BrandingForm>;
    const l = (q.data.localization ?? {}) as Partial<LocalizationForm>;
    const f = (q.data.features ?? {}) as Partial<FeaturesForm>;
    setBranding({
      site_name: b.site_name ?? "",
      logo_url: b.logo_url ?? "",
      favicon_url: b.favicon_url ?? "",
      primary_color: b.primary_color ?? "#6366f1",
      secondary_color: b.secondary_color ?? "#f59e0b",
    });
    setLocalization({
      default_language: l.default_language ?? "en",
      default_currency: l.default_currency ?? "ZAR",
      timezone: l.timezone ?? "Africa/Johannesburg",
    });
    setFeatures({
      auto_approve_providers: f.auto_approve_providers ?? false,
    });
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: () => {
      // Merge changed sections into the existing settings
      const existing = q.data ?? {};
      const merged: FullSettings = {
        ...existing,
        branding: { ...((existing.branding as Record<string, unknown>) ?? {}), ...branding },
        localization: { ...((existing.localization as Record<string, unknown>) ?? {}), ...localization },
        features: { ...((existing.features as Record<string, unknown>) ?? {}), ...features },
      };
      return adminApi.patchJson("/api/admin/settings", merged);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.settings() });
      setSaved(true);
      setSaveError(null);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e) => setSaveError(e instanceof Error ? e.message : "Failed to save"),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Platform settings" />
        <AdminPanel>
          <AdminPageSkeleton rows={6} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Platform settings"
        description="Configure branding, localisation, and core platform features."
        actions={
          <button
            type="button"
            className={adminToolbarButtonClass(q.isFetching)}
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            Refresh
          </button>
        }
      />

      <AdminPanel>
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Branding</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {inp("Site name", branding.site_name, (v) => setBranding((p) => ({ ...p, site_name: v })))}
          {inp("Logo URL", branding.logo_url, (v) => setBranding((p) => ({ ...p, logo_url: v })), "url")}
          {inp("Favicon URL", branding.favicon_url, (v) => setBranding((p) => ({ ...p, favicon_url: v })), "url")}
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Primary colour</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={branding.primary_color}
                onChange={(e) => setBranding((p) => ({ ...p, primary_color: e.target.value }))}
                className="h-8 w-10 cursor-pointer rounded border border-gray-300"
              />
              <input
                type="text"
                value={branding.primary_color}
                onChange={(e) => setBranding((p) => ({ ...p, primary_color: e.target.value }))}
                className="flex-1 rounded border border-gray-300 px-3 py-1.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Secondary colour</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={branding.secondary_color}
                onChange={(e) => setBranding((p) => ({ ...p, secondary_color: e.target.value }))}
                className="h-8 w-10 cursor-pointer rounded border border-gray-300"
              />
              <input
                type="text"
                value={branding.secondary_color}
                onChange={(e) => setBranding((p) => ({ ...p, secondary_color: e.target.value }))}
                className="flex-1 rounded border border-gray-300 px-3 py-1.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Localisation</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Default language</label>
            <select
              value={localization.default_language}
              onChange={(e) => setLocalization((p) => ({ ...p, default_language: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="en">English</option>
              <option value="af">Afrikaans</option>
              <option value="zu">Zulu</option>
              <option value="xh">Xhosa</option>
              <option value="st">Sotho</option>
              <option value="fr">French</option>
              <option value="pt">Portuguese</option>
            </select>
          </div>
          {inp("Default currency (ISO 4217)", localization.default_currency, (v) =>
            setLocalization((p) => ({ ...p, default_currency: v.toUpperCase() }))
          )}
          {inp("Timezone (IANA)", localization.timezone, (v) =>
            setLocalization((p) => ({ ...p, timezone: v }))
          )}
        </div>
      </AdminPanel>

      <AdminPanel>
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Provider features</h3>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={features.auto_approve_providers}
            onChange={(e) => setFeatures((p) => ({ ...p, auto_approve_providers: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          <span className="text-sm text-gray-700">Auto-approve new providers (skip manual review)</span>
        </label>
      </AdminPanel>

      {saveError && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
      )}
      {saved && (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">Settings saved!</p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()}
          className="rounded bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {saveMut.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
