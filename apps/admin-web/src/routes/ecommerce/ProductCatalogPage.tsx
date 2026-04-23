import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ADMIN_SECTION_ECOMMERCE } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { adminToast } from "@/lib/adminToast";
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
import { adminSpaTo } from "@/lib/adminSpaPath";
import { AdminProductEditorSheet } from "./AdminProductEditorSheet";

type ProductRow = Record<string, unknown> & {
  id?: string;
  name?: string;
  sku?: string;
  brand?: string;
  category?: string;
  retail_price?: number;
  display_retail_price?: number;
  supply_price?: number;
  quantity?: number;
  effective_quantity?: number;
  track_stock_quantity?: boolean;
  low_stock_level?: number;
  is_active?: boolean;
  retail_sales_enabled?: boolean;
  has_variants?: boolean;
  variant_count?: number;
  variant_option_types?: { name: string; values: string[] }[];
  image_urls?: string[];
  preferred_currency?: string;
  provider?: { id?: string; business_name?: string; status?: string } | null;
};

type CatalogPayload = {
  products: ProductRow[];
  categories: string[];
  pagination: { totalPages: number; total: number };
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "ZAR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function ProductCatalogPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_ECOMMERCE, "E-commerce access is required.");
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const search = sp.get("search") || "";
  const category = sp.get("category") || "";
  const [searchDraft, setSearchDraft] = useState(search);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  useEffect(() => {
    setSearchDraft(search);
  }, [search]);
  const activeOnly = sp.get("active_only") === "1";
  const retailOnly = sp.get("retail_only") === "1";
  const qk = useMemo(
    () => `${page}|${search}|${category}|${activeOnly}|${retailOnly}`,
    [page, search, category, activeOnly, retailOnly],
  );

  const q = useQuery({
    queryKey: adminQueryKeys.productCatalog(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "24");
      if (search) p.set("search", search);
      if (category) p.set("category", category);
      if (activeOnly) p.set("active_only", "1");
      if (retailOnly) p.set("retail_only", "1");
      return adminApi.getJson<CatalogPayload>(`/api/admin/ecommerce/catalog?${p}`, { timeoutMs: 60_000 });
    },
    enabled: allowed,
  });

  const rows = q.data?.products ?? [];
  const categories = q.data?.categories ?? [];
  const totalPages = q.data?.pagination?.totalPages ?? 1;

  const toggleMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      adminApi.patchJson(`/api/admin/ecommerce/catalog/${id}`, body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: adminQueryKeys.productCatalog(qk) });
      void qc.invalidateQueries({ queryKey: adminQueryKeys.productCatalogDetail(vars.id) });
      if ("is_active" in vars.body) {
        adminToast.success(vars.body.is_active ? "Product activated" : "Product deactivated");
      } else if ("retail_sales_enabled" in vars.body) {
        adminToast.success(vars.body.retail_sales_enabled ? "Retail sales enabled" : "Retail sales disabled");
      } else {
        adminToast.success("Product updated");
      }
    },
    onError: (err: Error) => adminToast.error(err.message || "Failed to update product"),
  });

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
        <AdminPageHeader title="Product catalog" />
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
      <AdminPageHeader
        title="Product catalog"
        description="Tenant-wide SKUs with images, variants, and pricing — edit in place (same fields as the provider portal)."
        actions={
          <Link
            to={adminSpaTo("/admin/ecommerce")}
            className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-950/[0.04] hover:bg-gray-50"
          >
            E-commerce overview
          </Link>
        }
      />
      <AdminPanel>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block text-sm text-gray-600">
            Search
            <input
              type="search"
              className="mt-1 block w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  patch({ search: searchDraft.trim() || null, page: "1" });
                }
              }}
            />
          </label>
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            onClick={() => patch({ search: searchDraft.trim() || null, page: "1" })}
          >
            Apply
          </button>
          <label className="text-sm text-gray-600">
            Category{" "}
            <select
              className="ml-2 rounded border border-gray-300 px-2 py-2 text-sm"
              value={category}
              onChange={(e) => patch({ category: e.target.value || null, page: "1" })}
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => patch({ active_only: e.target.checked ? "1" : null, page: "1" })}
            />
            Active only
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={retailOnly}
              onChange={(e) => patch({ retail_only: e.target.checked ? "1" : null, page: "1" })}
            />
            Retail-enabled only
          </label>
        </div>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No products" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh className="w-14"> </AdminTh>
              <AdminTh>Name</AdminTh>
              <AdminTh>SKU</AdminTh>
              <AdminTh>Brand</AdminTh>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Retail</AdminTh>
              <AdminTh>Price</AdminTh>
              <AdminTh>Stock</AdminTh>
              <AdminTh>Variants</AdminTh>
              <AdminTh>Actions</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((p) => {
              const cur = String(p.preferred_currency ?? "ZAR");
              const thumb = Array.isArray(p.image_urls) && p.image_urls[0] ? String(p.image_urls[0]) : "";
              const listPrice =
                typeof p.display_retail_price === "number" ? p.display_retail_price : Number(p.retail_price ?? 0);
              const showFrom = Boolean(p.has_variants && (p.variant_count ?? 0) > 0);
              const stock =
                typeof p.effective_quantity === "number" ? p.effective_quantity : Number(p.quantity ?? 0);
              const low = Number(p.low_stock_level) || 5;
              const track = p.track_stock_quantity !== false;
              const stockClass =
                !track ? "text-gray-400" : stock === 0 ? "text-red-600 font-semibold" : stock <= low ? "text-amber-700 font-medium" : "";

              return (
                <tr key={String(p.id)} className={p.is_active === false ? "opacity-50" : ""}>
                  <AdminTd className="w-14">
                    {thumb ? (
                      <img src={thumb} alt="" className="h-10 w-10 rounded-lg border border-gray-100 object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-[10px] text-gray-400">
                        —
                      </div>
                    )}
                  </AdminTd>
                  <AdminTd>
                    <div className="font-medium">{String(p.name ?? "")}</div>
                    {p.category && <div className="text-xs text-gray-400">{String(p.category)}</div>}
                  </AdminTd>
                  <AdminTd className="font-mono text-xs">{String(p.sku ?? "—")}</AdminTd>
                  <AdminTd className="text-xs text-gray-600">{String(p.brand ?? "—")}</AdminTd>
                  <AdminTd>
                    {p.provider?.id ? (
                      <Link className="text-primary underline" to={adminSpaTo(`/admin/providers/${p.provider.id}`)}>
                        {String(p.provider.business_name ?? "")}
                      </Link>
                    ) : (
                      String(p.provider?.business_name ?? "")
                    )}
                  </AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      disabled={toggleMut.isPending}
                      onClick={() => p.id && toggleMut.mutate({ id: String(p.id), body: { is_active: !p.is_active } })}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.is_active ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >
                      {p.is_active ? "active" : "inactive"}
                    </button>
                  </AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      disabled={toggleMut.isPending}
                      onClick={() =>
                        p.id && toggleMut.mutate({ id: String(p.id), body: { retail_sales_enabled: !p.retail_sales_enabled } })
                      }
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.retail_sales_enabled ? "bg-blue-100 text-blue-800 hover:bg-blue-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >
                      {p.retail_sales_enabled ? "yes" : "no"}
                    </button>
                  </AdminTd>
                  <AdminTd className="tabular-nums text-sm">
                    {showFrom ? (
                      <span className="inline-flex flex-wrap items-baseline gap-1">
                        <span className="text-[10px] font-normal uppercase text-gray-400">From</span>
                        {money(listPrice, cur)}
                      </span>
                    ) : (
                      money(listPrice, cur)
                    )}
                    {p.supply_price != null && Number(p.supply_price) > 0 && (
                      <div className="text-xs text-gray-400">cost {money(Number(p.supply_price), cur)}</div>
                    )}
                  </AdminTd>
                  <AdminTd className={`tabular-nums text-sm ${stockClass}`}>
                    {!track ? "—" : stock === 0 ? "Out" : stock}
                  </AdminTd>
                  <AdminTd>
                    {p.has_variants ? (
                      <div>
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                          {p.variant_count ?? 0} variant{(p.variant_count ?? 0) !== 1 ? "s" : ""}
                        </span>
                        {Array.isArray(p.variant_option_types) && p.variant_option_types.length > 0 && (
                          <div className="mt-0.5 text-xs text-gray-400">
                            {p.variant_option_types.map((o) => o.name).join(", ")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </AdminTd>
                  <AdminTd>
                    <button
                      type="button"
                      className="text-xs font-medium text-primary underline"
                      onClick={() => p.id && setEditProductId(String(p.id))}
                    >
                      Edit product
                    </button>
                  </AdminTd>
                </tr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
      {totalPages > 1 ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => patch({ page: String(page - 1) })}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => patch({ page: String(page + 1) })}
          >
            Next
          </button>
        </div>
      ) : null}

      <AdminProductEditorSheet
        open={!!editProductId}
        productId={editProductId}
        onClose={() => setEditProductId(null)}
        onSaved={() => void qc.invalidateQueries({ queryKey: adminQueryKeys.productCatalog(qk) })}
      />
    </div>
  );
}
