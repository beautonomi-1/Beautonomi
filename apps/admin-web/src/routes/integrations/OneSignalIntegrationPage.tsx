import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { Link } from "react-router";
import { adminSpaTo } from "@/lib/adminSpaPath";

type OnesignalConfig = {
  onesignal?: {
    settings_enabled?: boolean;
  };
  onesignal_apps?: Record<string, unknown>;
  diagnostics?: {
    onesignal_configured?: boolean;
    onesignal_missing?: string[];
  };
  channels?: Array<{ key: string; configured?: boolean }>;
};

export function OneSignalIntegrationPage() {
  useAdminDocumentTitle("OneSignal");
  const { allowed, denied } = useSuperadminPage("Superadmin access is required.");

  const query = useQuery({
    queryKey: adminQueryKeys.notificationsConfig(),
    enabled: allowed,
    queryFn: () => adminApi.getJson<OnesignalConfig>("/api/admin/notifications/config", { timeoutMs: 30_000 }),
  });

  if (denied) return denied;

  const authFailed = isAdminApiAuthFailure(query.error);
  const d = query.data;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="OneSignal"
        description="Push / email / SMS delivery. Credentials are in platform settings (customer vs provider apps). Edit keys under Notifications."
      />
      <AdminPanel>
        <div className="mb-3 flex gap-2">
          <Link className="text-sm text-violet-700 underline" to={adminSpaTo("/admin/notifications")}>
            Edit OneSignal credentials
          </Link>
          <button type="button" className={adminToolbarButtonClass()} onClick={() => void query.refetch()}>
            Refresh
          </button>
        </div>
        {query.isLoading ? (
          <AdminPageSkeleton rows={3} />
        ) : authFailed ? (
          <AdminRetryBlock message={query.error instanceof Error ? query.error.message : "Failed to load"} onRetry={() => void query.refetch()} />
        ) : (
          <dl className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-500">Settings enabled</dt>
              <dd>{d?.onesignal?.settings_enabled === false ? "No" : "Yes"}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Configured</dt>
              <dd>{d?.diagnostics?.onesignal_configured ? "Yes" : "No"}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-xs text-gray-500">Missing</dt>
              <dd>{(d?.diagnostics?.onesignal_missing ?? []).join(", ") || "—"}</dd>
            </div>
          </dl>
        )}
      </AdminPanel>
    </div>
  );
}
