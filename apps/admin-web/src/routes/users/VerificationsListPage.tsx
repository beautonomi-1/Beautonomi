import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_USERS_TRUST } from "@beautonomi/admin-access";
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
import { adminTabButtonClass } from "@/lib/adminUi";
import { legacyAdminHref } from "@/lib/legacyAdminOrigin";

type VerRow = Record<string, unknown> & {
  id?: string;
  status?: string;
  user?: { full_name?: string; email?: string };
};

export function VerificationsListPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_USERS_TRUST, "Users & trust access is required.");
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") || "pending";

  const q = useQuery({
    queryKey: adminQueryKeys.verifications(status),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("status", status);
      return adminApi.getJson<VerRow[]>(`/api/admin/verifications?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = Array.isArray(q.data) ? q.data : [];

  const tabs = ["pending", "approved", "rejected", "all"] as const;

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Verifications" />
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

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Verifications" description="GET /api/admin/verifications" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/verifications")} className="font-medium text-gray-900 underline">
          Review actions in legacy →
        </a>
      </p>
      <AdminPanel>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              className={adminTabButtonClass(status === t)}
              onClick={() => {
                const n = new URLSearchParams(sp);
                n.set("status", t);
                setSp(n, { replace: true });
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No verifications" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>User</AdminTh>
              <AdminTh>Email</AdminTh>
              <AdminTh>Status</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <AdminTd>{String(r.user?.full_name ?? "")}</AdminTd>
                <AdminTd>{String(r.user?.email ?? "")}</AdminTd>
                <AdminTd>{String(r.status ?? "")}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
