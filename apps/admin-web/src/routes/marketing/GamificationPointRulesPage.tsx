import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_MARKETING_COMMS } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

type Payload = { rules: Record<string, unknown>[] };

export function GamificationPointRulesPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const q = useQuery({
    queryKey: adminQueryKeys.gamificationPointRules(),
    queryFn: () => adminApi.getJson<Payload>("/api/admin/gamification/point-rules", { timeoutMs: 60_000 }),
    enabled: allowed,
  });
  const rows = q.data?.rules ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Point rules" />
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
      <AdminPageHeader title="Gamification · Point rules" description="GET /api/admin/gamification/point-rules" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/gamification/point-rules")} className="font-medium text-gray-900 underline">
          Legacy editor →
        </a>
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No rules" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Source</AdminTh>
              <AdminTh>Points</AdminTh>
              <AdminTh>Label</AdminTh>
              <AdminTh>Order</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              return (
                <tr key={String(row.id ?? row.source ?? "")}>
                  <AdminTd>{String(row.source ?? "")}</AdminTd>
                  <AdminTd className="tabular-nums">{String(row.points ?? "")}</AdminTd>
                  <AdminTd>{String(row.label ?? "")}</AdminTd>
                  <AdminTd>{String(row.display_order ?? "")}</AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
