import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
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

type Gc = Record<string, unknown> & { id?: string; code?: string; balance?: number; is_active?: boolean };

type GiftPayload = {
  gift_cards: Gc[];
  meta: { page: number; limit: number; total: number; has_more: boolean };
};

export function GiftCardsListPage() {
  const { allowed, denied } = useAdminSectionPage(
    ADMIN_SECTION_MARKETING_COMMS,
    "Marketing & comms access is required."
  );
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const status = sp.get("status") || "";
  const qk = useMemo(() => `${page}|${status}`, [page, status]);

  const q = useQuery({
    queryKey: adminQueryKeys.giftCards(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "30");
      if (status) p.set("status", status);
      return adminApi.getJson<GiftPayload>(`/api/admin/gift-cards?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.gift_cards ?? [];
  const meta = q.data?.meta;

  function patch(u: Record<string, string | null>) {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(u)) {
      if (v == null || v === "") n.delete(k);
      else n.set(k, v);
    }
    setSp(n, { replace: true });
  }

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Gift cards" />
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
      <AdminPageHeader title="Gift cards" description="GET /api/admin/gift-cards" />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/gift-cards")} className="font-medium text-gray-900 underline">
          Issue cards in legacy →
        </a>
      </p>
      <AdminPanel>
        <label className="text-sm text-gray-600">
          Status{" "}
          <select
            className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
            value={status}
            onChange={(e) => patch({ status: e.target.value || null, page: "1" })}
          >
            <option value="">All</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="expired">expired</option>
            <option value="zero_balance">zero_balance</option>
          </select>
        </label>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No gift cards" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Code</AdminTh>
              <AdminTh>Balance</AdminTh>
              <AdminTh>Active</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <AdminTd className="font-mono text-xs">{String(r.code ?? "")}</AdminTd>
                <AdminTd className="tabular-nums">{String(r.balance ?? "")}</AdminTd>
                <AdminTd>{r.is_active ? "yes" : "no"}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {meta?.has_more ? (
        <button
          type="button"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          onClick={() => patch({ page: String(page + 1) })}
        >
          Next page
        </button>
      ) : null}
    </div>
  );
}
