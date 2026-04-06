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

export function LoyaltyRulesPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const q = useQuery({
    queryKey: adminQueryKeys.loyaltyRules(),
    queryFn: () => adminApi.getJson<Record<string, unknown>[]>("/api/admin/loyalty/rules", { timeoutMs: 60_000 }),
    enabled: allowed,
  });
  const rows = q.data ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Loyalty" />
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

  const cols = rows[0] ? Object.keys(rows[0]).slice(0, 8) : ["id", "currency", "is_active"];

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Loyalty rules" description="GET /api/admin/loyalty/rules" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/loyalty")} className="font-medium text-gray-900 underline">
          Legacy loyalty (edit) →
        </a>
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No loyalty rules" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              {cols.map((c) => (
                <AdminTh key={c}>{c}</AdminTh>
              ))}
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r, i) => (
              <tr key={String((r as { id?: string }).id ?? i)}>
                {cols.map((c) => (
                  <AdminTd key={c} className="max-w-[10rem] truncate text-xs">
                    {String((r as Record<string, unknown>)[c] ?? "")}
                  </AdminTd>
                ))}
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
