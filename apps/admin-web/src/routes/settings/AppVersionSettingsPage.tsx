import { useState, useEffect } from "react";
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

type PlatformVersion = {
  min_version: string;
  latest_version: string;
  force_update: boolean;
  update_url: string;
};

type AppVersionData = {
  ios: PlatformVersion;
  android: PlatformVersion;
};

const DEFAULTS: AppVersionData = {
  ios: {
    min_version: "1.0.0",
    latest_version: "1.0.0",
    force_update: false,
    update_url: "https://apps.apple.com/app/beautonomi",
  },
  android: {
    min_version: "1.0.0",
    latest_version: "1.0.0",
    force_update: false,
    update_url: "https://play.google.com/store/apps/details?id=com.beautonomi",
  },
};

function PlatformForm({
  platform,
  value,
  onChange,
}: {
  platform: "iOS" | "Android";
  value: PlatformVersion;
  onChange: (v: PlatformVersion) => void;
}) {
  const field = (label: string, key: keyof PlatformVersion, type = "text") => (
    <div key={key}>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {type === "checkbox" ? (
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={value[key] as boolean}
            onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          <span className="text-sm text-gray-700">Force update (users must upgrade)</span>
        </label>
      ) : (
        <input
          type="text"
          value={value[key] as string}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">{platform}</h3>
      {field("Minimum version", "min_version")}
      {field("Latest version", "latest_version")}
      {field("Store URL", "update_url")}
      {field("Force update", "force_update", "checkbox")}
    </div>
  );
}

export function AppVersionSettingsPage() {
  useAdminDocumentTitle("App Version");
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required."
  );
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: adminQueryKeys.appVersion(),
    queryFn: () => adminApi.getJson<AppVersionData>("/api/admin/app-version", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  const [form, setForm] = useState<AppVersionData>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (q.data) {
      setForm({ ios: { ...DEFAULTS.ios, ...q.data.ios }, android: { ...DEFAULTS.android, ...q.data.android } });
    }
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: () => adminApi.patchJson("/api/admin/app-version", form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.appVersion() });
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
        <AdminPageHeader title="App version" />
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
        title="App version settings"
        description="Control minimum and latest app versions for iOS and Android."
        actions={
          <button
            type="button"
            className={adminToolbarButtonClass(q.isFetching)}
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
          >
            Refresh
          </button>
        }
      />
      <AdminPanel>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <PlatformForm
            platform="iOS"
            value={form.ios}
            onChange={(v) => setForm((p) => ({ ...p, ios: v }))}
          />
          <PlatformForm
            platform="Android"
            value={form.android}
            onChange={(v) => setForm((p) => ({ ...p, android: v }))}
          />
        </div>

        {saveError && (
          <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
        )}
        {saved && (
          <p className="mt-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700">Saved!</p>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={saveMut.isPending}
            onClick={() => saveMut.mutate()}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {saveMut.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </AdminPanel>
    </div>
  );
}
