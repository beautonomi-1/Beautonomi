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
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

export function ReferralsSettingsPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required."
  );

  const q = useQuery({
    queryKey: adminQueryKeys.referrals(),
    queryFn: () => adminApi.getJson<Record<string, unknown>>("/api/admin/referrals", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Referral settings" />
        <AdminPanel>
          <AdminPageSkeleton rows={3} />
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
      <AdminPageHeader title="Referral settings" description="GET /api/admin/referrals" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/settings/referrals")} className="font-medium text-gray-900 underline">
          Edit in legacy (PATCH) →
        </a>
      </p>
      <AdminPanel>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {Object.entries(q.data ?? {}).map(([k, v]) => (
            <div key={k}>
              <dt className="text-gray-500">{k}</dt>
              <dd className="font-medium">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
        </dl>
      </AdminPanel>
    </div>
  );
}
