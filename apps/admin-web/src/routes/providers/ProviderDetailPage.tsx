import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

export function ProviderDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PROVIDERS_OPERATIONS,
    "Providers & operations access is required."
  );

  const q = useQuery({
    queryKey: adminQueryKeys.providers.detail(id),
    queryFn: () => adminApi.getJson<Record<string, unknown>>(`/api/admin/providers/${encodeURIComponent(id)}`, { timeoutMs: 60_000 }),
    enabled: allowed && !!id,
  });

  if (denied) return denied;
  if (!id) {
    return <AdminRetryBlock message="Missing provider id" onRetry={() => {}} />;
  }
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Provider" />
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

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Provider detail" description={`GET /api/admin/providers/${id}`} />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref(`/admin/providers/${id}`)} className="font-medium text-gray-900 underline">
          Legacy provider (edit, payouts) →
        </a>
      </p>
      <AdminPanel>
        <pre className="max-h-[560px] overflow-auto rounded bg-gray-50 p-4 text-xs">{JSON.stringify(q.data, null, 2)}</pre>
      </AdminPanel>
    </div>
  );
}
