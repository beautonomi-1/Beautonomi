import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_OPERATIONS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";

export function SystemHealthPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_OPERATIONS, "Operations access is required.");
  const [sp] = useSearchParams();
  const hours = sp.get("hours") || "24";
  const type = sp.get("type") || "";
  const qk = `${hours}|${type}`;

  const q = useQuery({
    queryKey: adminQueryKeys.systemHealth(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("hours", hours);
      if (type) p.set("type", type);
      return adminApi.getJson<Record<string, unknown>>(`/api/admin/system-health?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="System health" />
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
      <AdminPageHeader title="System health" description="GET /api/admin/system-health" />
      <AdminPanel>
        <pre className="max-h-[480px] overflow-auto rounded bg-gray-50 p-4 text-xs">{JSON.stringify(q.data, null, 2)}</pre>
      </AdminPanel>
    </div>
  );
}
