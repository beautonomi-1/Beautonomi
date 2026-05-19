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

type AppPair = {
  ios: PlatformVersion;
  android: PlatformVersion;
};

type FullAppVersionData = {
  customer: AppPair;
  provider: AppPair;
};

const DEFAULT_PAIR: AppPair = {
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

const DEFAULTS: FullAppVersionData = {
  customer: { ios: { ...DEFAULT_PAIR.ios }, android: { ...DEFAULT_PAIR.android } },
  provider: {
    ios: { ...DEFAULT_PAIR.ios },
    android: {
      ...DEFAULT_PAIR.android,
      update_url: "https://play.google.com/store/apps/details?id=com.beautonomi.partner",
    },
  },
};

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const CURRENT_NATIVE_VERSION = "1.0.41";

function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    value
      .trim()
      .replace(/^v/i, "")
      .split(/[+-]/)[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));
  const aParts = parse(a);
  const bParts = parse(b);
  const maxLength = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLength; i += 1) {
    const aVal = aParts[i] ?? 0;
    const bVal = bParts[i] ?? 0;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }
  return 0;
}

function validatePlatformVersion(app: string, platform: string, value: PlatformVersion): string[] {
  const prefix = `${app} ${platform}`;
  const errors: string[] = [];
  if (!SEMVER_PATTERN.test(value.min_version.trim())) {
    errors.push(`${prefix}: minimum version must look like 1.2.3.`);
  }
  if (!SEMVER_PATTERN.test(value.latest_version.trim())) {
    errors.push(`${prefix}: latest version must look like 1.2.3.`);
  }
  if (
    SEMVER_PATTERN.test(value.min_version.trim()) &&
    SEMVER_PATTERN.test(value.latest_version.trim()) &&
    compareVersions(value.latest_version, value.min_version) < 0
  ) {
    errors.push(`${prefix}: latest version cannot be older than minimum version.`);
  }
  try {
    const url = new URL(value.update_url);
    if (!["https:", "market:", "itms-apps:"].includes(url.protocol)) {
      errors.push(`${prefix}: store URL must use https, market, or itms-apps.`);
    }
  } catch {
    errors.push(`${prefix}: store URL is invalid.`);
  }
  return errors;
}

function validateForm(form: FullAppVersionData): string[] {
  return [
    ...validatePlatformVersion("Customer", "iOS", form.customer.ios),
    ...validatePlatformVersion("Customer", "Android", form.customer.android),
    ...validatePlatformVersion("Provider", "iOS", form.provider.ios),
    ...validatePlatformVersion("Provider", "Android", form.provider.android),
  ];
}

function rolloutState(value: PlatformVersion) {
  const belowMin = compareVersions(CURRENT_NATIVE_VERSION, value.min_version) < 0;
  const belowLatest = compareVersions(CURRENT_NATIVE_VERSION, value.latest_version) < 0;
  if (value.force_update && belowMin) {
    return {
      tone: "danger" as const,
      label: "Current store build would be blocked",
      detail: `v${CURRENT_NATIVE_VERSION} is below minimum v${value.min_version}.`,
    };
  }
  if (belowLatest) {
    return {
      tone: "warn" as const,
      label: "Optional update prompt",
      detail: `v${CURRENT_NATIVE_VERSION} is below latest v${value.latest_version}.`,
    };
  }
  return {
    tone: "ok" as const,
    label: "No prompt for current build",
    detail: `v${CURRENT_NATIVE_VERSION} satisfies this policy.`,
  };
}

function PlatformForm({
  platform,
  value,
  onChange,
}: {
  platform: "iOS" | "Android";
  value: PlatformVersion;
  onChange: (v: PlatformVersion) => void;
}) {
  const state = rolloutState(value);
  const field = (label: string, key: keyof PlatformVersion, type = "text", help?: string) => (
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
          onChange={(e) => onChange({ ...value, [key]: e.target.value.trim() })}
          placeholder={key === "update_url" ? "https://apps.apple.com/... or https://play.google.com/..." : "1.0.0"}
          className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      )}
      {help ? <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{help}</p> : null}
    </div>
  );

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">{platform}</h3>
      <div className={`rounded-lg border px-3 py-2 text-xs ${
        state.tone === "danger"
          ? "border-red-200 bg-red-50 text-red-700"
          : state.tone === "warn"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-green-200 bg-green-50 text-green-700"
      }`}>
        <p className="font-semibold">{state.label}</p>
        <p className="mt-0.5">{state.detail}</p>
      </div>
      {field("Minimum version", "min_version", "text", "Users below this version are blocked only when Force update is enabled.")}
      {field("Latest version", "latest_version", "text", "Users below this version see an optional update prompt. Keep this at or above minimum.")}
      {field("Store URL", "update_url", "text", "Use the exact App Store or Play Store listing URL for this app and platform.")}
      {field("Force update", "force_update", "checkbox")}
    </div>
  );
}

function AppBlock({
  title,
  subtitle,
  pair,
  onChange,
}: {
  title: string;
  subtitle: string;
  pair: AppPair;
  onChange: (next: AppPair) => void;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50/50 p-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-600">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <PlatformForm
          platform="iOS"
          value={pair.ios}
          onChange={(v) => onChange({ ...pair, ios: v })}
        />
        <PlatformForm
          platform="Android"
          value={pair.android}
          onChange={(v) => onChange({ ...pair, android: v })}
        />
      </div>
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
    queryFn: () => adminApi.getJson<FullAppVersionData>("/api/admin/app-version", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  const [form, setForm] = useState<FullAppVersionData>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const validationErrors = validateForm(form);

  useEffect(() => {
    if (q.data) {
      setForm({
        customer: {
          ios: { ...DEFAULTS.customer.ios, ...q.data.customer?.ios },
          android: { ...DEFAULTS.customer.android, ...q.data.customer?.android },
        },
        provider: {
          ios: { ...DEFAULTS.provider.ios, ...q.data.provider?.ios },
          android: { ...DEFAULTS.provider.android, ...q.data.provider?.android },
        },
      });
    }
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (validationErrors.length > 0) {
        throw new Error(validationErrors[0]);
      }
      return adminApi.patchJson("/api/admin/app-version", form);
    },
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
          <AdminPageSkeleton rows={8} />
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
        description="Separate minimum / latest versions and store URLs for the customer and provider native apps (iOS and Android each)."
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
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <p className="font-semibold">Release safety guide</p>
          <p className="mt-1 leading-relaxed">
            Current native app version is tracked as v{CURRENT_NATIVE_VERSION}. Set Latest first for soft prompts; raise Minimum and enable Force update only after the new build is live in both stores.
          </p>
        </div>
        <div className="space-y-8">
          <AppBlock
            title="Customer app"
            subtitle="Used when the customer Expo app calls /api/public/app-version?app=customer"
            pair={form.customer}
            onChange={(next) => setForm((p) => ({ ...p, customer: next }))}
          />
          <AppBlock
            title="Provider app"
            subtitle="Used when the provider Expo app calls /api/public/app-version?app=provider"
            pair={form.provider}
            onChange={(next) => setForm((p) => ({ ...p, provider: next }))}
          />
        </div>

        {saveError && (
          <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
        )}
        {validationErrors.length > 0 && (
          <div className="mt-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p className="font-medium">Fix before saving:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {validationErrors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </div>
        )}
        {saved && (
          <p className="mt-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700">Saved!</p>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={saveMut.isPending || validationErrors.length > 0}
            onClick={() => saveMut.mutate()}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveMut.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </AdminPanel>
    </div>
  );
}
