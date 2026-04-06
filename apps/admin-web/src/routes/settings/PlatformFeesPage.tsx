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

/** API uses `ADMIN_SECTION_PLATFORM_CONFIG` (not finance) — matches `GET /api/admin/platform-fees`. */
export function PlatformFeesPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_PLATFORM_CONFIG,
    "Platform configuration access is required for platform fees."
  );

  const q = useQuery({
    queryKey: adminQueryKeys.platformFees(),
    queryFn: () => adminApi.getJson<Record<string, unknown>>("/api/admin/platform-fees", { timeoutMs: 30_000 }),
    enabled: allowed,
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Platform fees" />
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

  const d = q.data ?? {};

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Platform fees"
        description="Read-only in SPA; API is gated as platform_config. Editing uses PATCH when a form is added."
      />
      <AdminPanel>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {Object.entries(d).map(([k, v]) => (
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
