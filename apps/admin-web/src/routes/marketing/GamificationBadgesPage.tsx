import { useSearchParams } from "react-router-dom";
import { useMemo } from "react";
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

type Payload = { badges: Record<string, unknown>[]; total: number };

export function GamificationBadgesPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_MARKETING_COMMS, "Marketing access is required.");
  const [sp, setSp] = useSearchParams();
  const inc = sp.get("include_inactive") === "true" ? "true" : "false";
  const qk = useMemo(() => adminQueryKeys.gamificationBadges(inc), [inc]);

  const q = useQuery({
    queryKey: qk,
    queryFn: () =>
      adminApi.getJson<Payload>(`/api/admin/gamification/badges?include_inactive=${inc === "true"}`, { timeoutMs: 60_000 }),
    enabled: allowed,
  });
  const rows = q.data?.badges ?? [];

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Badges" />
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
      <AdminPageHeader title="Gamification · Badges" description="GET /api/admin/gamification/badges" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/gamification/badges")} className="font-medium text-gray-900 underline">
          Legacy badges →
        </a>
      </p>
      <AdminPanel>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={inc === "true"}
            onChange={(e) => {
              const n = new URLSearchParams(sp);
              if (e.target.checked) n.set("include_inactive", "true");
              else n.delete("include_inactive");
              setSp(n, { replace: true });
            }}
          />
          Include inactive
        </label>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No badges" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Tier</AdminTh>
              <AdminTh>Active</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => {
              const row = r as Record<string, unknown>;
              return (
                <tr key={String(row.id ?? "")}>
                  <AdminTd className="font-medium">{String(row.name ?? row.slug ?? "")}</AdminTd>
                  <AdminTd>{String(row.tier ?? "")}</AdminTd>
                  <AdminTd>{String(row.is_active ?? "")}</AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </div>
  );
}
