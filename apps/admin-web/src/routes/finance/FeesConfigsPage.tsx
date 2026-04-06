import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
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

type FeeConfig = Record<string, unknown>;

export function FeesConfigsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");
  const qk = adminQueryKeys.fees.configs("default");

  const q = useQuery({
    queryKey: qk,
    queryFn: () => adminApi.getJson<FeeConfig[]>("/api/admin/fees/configs", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  const rows = q.data ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Fee management" />
        <AdminPanel>
          <AdminPageSkeleton rows={5} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const cols =
    rows[0] != null
      ? Object.keys(rows[0]).filter((c) => c !== "secret" && c !== "secrets")
      : ["gateway_name", "currency", "is_active", "effective_from"];

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Fee management" description="GET /api/admin/fees/configs" />
      {rows.length === 0 ? (
        <EmptyState title="No fee configs" description="Table may be empty or not migrated for this tenant." />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              {cols.slice(0, 8).map((c) => (
                <AdminTh key={c}>{c}</AdminTh>
              ))}
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.slice(0, 8).map((c) => (
                  <AdminTd key={c} className="max-w-[12rem] truncate text-xs">
                    {String(r[c] ?? "")}
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
