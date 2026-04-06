import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_FINANCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";

type TaxesPayload = {
  tax_rates: Record<string, unknown>[];
  statistics?: Record<string, number>;
  provider_tax_rate?: unknown;
};

export function TaxesPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_FINANCE, "Finance access is required.");

  const q = useQuery({
    queryKey: adminQueryKeys.taxes(),
    queryFn: () => adminApi.getJson<TaxesPayload>("/api/admin/taxes", { timeoutMs: 60_000 }),
    enabled: allowed,
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Taxes" />
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

  const rates = q.data?.tax_rates ?? [];
  const stats = q.data?.statistics;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Taxes" description="GET /api/admin/taxes" />
      {stats ? (
        <AdminPanel>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Statistics</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(stats).map(([k, v]) => (
              <div key={k}>
                <dt className="text-gray-500">{k}</dt>
                <dd className="font-medium">{typeof v === "number" ? v.toFixed(2) : String(v)}</dd>
              </div>
            ))}
          </dl>
        </AdminPanel>
      ) : null}
      <AdminDataTable>
        <AdminTableHead>
          <tr>
            <AdminTh>Code</AdminTh>
            <AdminTh>Name</AdminTh>
            <AdminTh>Metadata</AdminTh>
          </tr>
        </AdminTableHead>
        <AdminTableBody>
          {rates.map((r, i) => (
            <tr key={i}>
              <AdminTd>{String(r.code ?? r.id ?? i)}</AdminTd>
              <AdminTd>{String(r.name ?? "")}</AdminTd>
              <AdminTd className="max-w-md truncate text-xs">{JSON.stringify(r.metadata ?? {})}</AdminTd>
            </tr>
          ))}
        </AdminTableBody>
      </AdminDataTable>
    </div>
  );
}
