import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { adminToast } from "@/lib/adminToast";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminMutationAlert } from "@/components/admin/AdminMutationAlert";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";

type AppleProductRow = {
  product_id: string;
  kind: string;
  reference_name: string;
  display_name: string;
  is_active: boolean;
  apple_price_zar: number;
  target_apple_price_zar: number;
  suggested_price_point: number;
  asc_reported_price_zar: number | null;
  web_price_zar: number;
  drift: { price: boolean; asc: boolean; any: boolean };
  mapping: { ok: boolean; active: boolean };
};

type ProductsPayload = {
  commission_rate: number;
  items: AppleProductRow[];
  summary: { total: number; active: number; drift_count: number; unmapped_count: number };
};

const zar = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);

export function AppleProductsPage() {
  useAdminDocumentTitle("Apple IAP Products");
  const { allowed, denied } = useSuperadminPage("Apple IAP product registry is superadmin-only.");
  void allowed;
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, { apple_price_zar: string; is_active: boolean }>>({});

  const q = useQuery({
    queryKey: adminQueryKeys.appleProducts(),
    queryFn: () =>
      adminApi.getJson<ProductsPayload>("/api/admin/monetization/apple/products", { timeoutMs: 30_000 }),
  });

  const save = useMutation({
    mutationFn: () => {
      const products = Object.entries(edits).map(([product_id, v]) => ({
        product_id,
        apple_price_zar: parseFloat(v.apple_price_zar) || 0,
        is_active: v.is_active,
      }));
      if (products.length === 0) throw new Error("No changes to save");
      return adminApi.patchJson("/api/admin/monetization/apple/products", { products });
    },
    onSuccess: async () => {
      adminToast.success("Products updated");
      setEdits({});
      await qc.invalidateQueries({ queryKey: adminQueryKeys.appleProducts() });
    },
    onError: (error: Error) => adminToast.error(error.message),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Apple IAP Products" />
        <AdminPanel>
          <AdminPageSkeleton rows={8} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return <AdminRetryBlock message={q.error.message} onRetry={() => void q.refetch()} />;
  }

  const d = q.data;
  if (!d?.items) return <AdminRetryBlock message="Empty response" onRetry={() => void q.refetch()} />;

  const startEdit = (row: AppleProductRow) => {
    setEdits((prev) => ({
      ...prev,
      [row.product_id]: {
        apple_price_zar: String(prev[row.product_id]?.apple_price_zar ?? row.apple_price_zar),
        is_active: prev[row.product_id]?.is_active ?? row.is_active,
      },
    }));
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Apple IAP Products"
        description="Product registry with price drift detection vs web catalog and ASC-reported prices."
      />
      <AdminMutationAlert errors={[save.error instanceof Error ? save.error : null]} />

      <AdminPanel>
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-gray-500">Total products</dt>
            <dd className="font-medium">{d.summary.total}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Active</dt>
            <dd className="font-medium">{d.summary.active}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Price drift</dt>
            <dd className="font-medium text-amber-700">{d.summary.drift_count}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Unmapped</dt>
            <dd className="font-medium">{d.summary.unmapped_count}</dd>
          </div>
        </dl>
        {Object.keys(edits).length > 0 ? (
          <button
            type="button"
            className={adminToolbarButtonClass(save.isPending) + " mt-4"}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : `Save ${Object.keys(edits).length} change(s)`}
          </button>
        ) : null}
      </AdminPanel>

      <AdminPanel className="overflow-x-auto">
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Product ID</AdminTh>
              <AdminTh>Kind</AdminTh>
              <AdminTh>Web</AdminTh>
              <AdminTh>Target</AdminTh>
              <AdminTh>Stored ZAR</AdminTh>
              <AdminTh>ASC reported</AdminTh>
              <AdminTh>Drift</AdminTh>
              <AdminTh>Active</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {d.items.map((row) => {
              const edit = edits[row.product_id];
              return (
                <tr key={row.product_id} className={row.drift.any ? "bg-amber-50/50" : undefined}>
                  <AdminTd className="max-w-[14rem] font-mono text-xs">{row.product_id}</AdminTd>
                  <AdminTd className="text-xs">{row.kind}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{zar(row.web_price_zar)}</AdminTd>
                  <AdminTd className="tabular-nums text-xs">{zar(row.target_apple_price_zar)}</AdminTd>
                  <AdminTd>
                    {edit ? (
                      <input
                        type="number"
                        step="0.01"
                        className="w-24 rounded border border-gray-200 px-2 py-1 text-xs"
                        value={edit.apple_price_zar}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [row.product_id]: { ...prev[row.product_id], apple_price_zar: e.target.value },
                          }))
                        }
                      />
                    ) : (
                      <button
                        type="button"
                        className="tabular-nums text-xs underline"
                        onClick={() => startEdit(row)}
                      >
                        {zar(row.apple_price_zar)}
                      </button>
                    )}
                  </AdminTd>
                  <AdminTd className="tabular-nums text-xs">{zar(row.asc_reported_price_zar)}</AdminTd>
                  <AdminTd>
                    {row.drift.any ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {row.drift.price ? "price" : ""}
                        {row.drift.price && row.drift.asc ? " · " : ""}
                        {row.drift.asc ? "asc" : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-green-700">ok</span>
                    )}
                  </AdminTd>
                  <AdminTd>
                    {edit ? (
                      <input
                        type="checkbox"
                        checked={edit.is_active}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [row.product_id]: { ...prev[row.product_id], is_active: e.target.checked },
                          }))
                        }
                      />
                    ) : (
                      <button type="button" className="text-xs underline" onClick={() => startEdit(row)}>
                        {row.is_active ? "yes" : "no"}
                      </button>
                    )}
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      </AdminPanel>
    </div>
  );
}
