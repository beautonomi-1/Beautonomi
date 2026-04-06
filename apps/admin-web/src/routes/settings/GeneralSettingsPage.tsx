import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";

export function GeneralSettingsPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required."
  );

  const q = useQuery({
    queryKey: adminQueryKeys.settings(),
    queryFn: () => adminApi.getJson<Record<string, unknown>>("/api/admin/settings", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Settings" />
        <AdminPanel>
          <AdminPageSkeleton rows={4} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const branding = (q.data?.branding as Record<string, unknown> | undefined) ?? {};
  const siteName = String(branding.site_name ?? "");

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Settings" description="GET /api/admin/settings (read-only summary in SPA)" />
      <AdminPanel>
        <p className="text-sm text-gray-700">
          <span className="text-gray-500">Site name:</span> {siteName || "—"}
        </p>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-900">Raw settings JSON</summary>
          <pre className="mt-2 max-h-[400px] overflow-auto rounded bg-gray-50 p-3 text-xs">
            {JSON.stringify(q.data, null, 2)}
          </pre>
        </details>
      </AdminPanel>
    </div>
  );
}
