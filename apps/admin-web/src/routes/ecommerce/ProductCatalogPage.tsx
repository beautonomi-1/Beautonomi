import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_ECOMMERCE } from "@beautonomi/admin-access";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { AdminApiError } from "@beautonomi/admin-api-client";
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

type ProductRow = Record<string, unknown> & {
  id?: string;
  name?: string;
  retail_price?: number;
  quantity?: number;
  provider?: { business_name?: string } | null;
};

type PublicProductsPayload = {
  products: ProductRow[];
  categories: string[];
  pagination: { totalPages: number; total: number };
};

async function fetchPublicProducts(qs: string): Promise<PublicProductsPayload> {
  // Intentional: public catalog contract — not `adminApi` / not scope-injected (see matrix + stabilization report).
  const res = await fetch(`/api/public/products?${qs}`, { credentials: "include" });
  const json = (await res.json().catch(() => ({}))) as { data?: PublicProductsPayload };
  if (!res.ok) {
    throw new AdminApiError(typeof json === "object" && json && "error" in json ? String(json.error) : "Request failed", res.status);
  }
  const data = json.data;
  if (!data) throw new AdminApiError("Invalid products response", 500);
  return data;
}

/**
 * Legacy admin used `GET /api/public/products` with a superadmin RoleGuard; matrix lists ecommerce section.
 * We gate with `ADMIN_SECTION_ECOMMERCE` in SPA; if the public API rejects non-superadmin, use legacy.
 */
export function ProductCatalogPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_ECOMMERCE, "E-commerce access is required.");
  const [sp, setSp] = useSearchParams();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const search = sp.get("search") || "";
  const category = sp.get("category") || "";
  const qk = useMemo(() => `${page}|${search}|${category}`, [page, search, category]);

  const q = useQuery({
    queryKey: adminQueryKeys.productCatalog(qk),
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("limit", "20");
      if (search) p.set("search", search);
      if (category) p.set("category", category);
      return fetchPublicProducts(p.toString());
    },
    enabled: allowed,
  });

  const rows = q.data?.products ?? [];
  const categories = q.data?.categories ?? [];
  const totalPages = q.data?.pagination?.totalPages ?? 1;

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
        description="Uses legacy GET /api/public/products (not an admin-scoped route) — see parity report."
      />
      <p className="text-sm text-gray-600">
        <a href={legacyAdminHref("/admin/ecommerce/products")} className="font-medium text-gray-900 underline">
          Legacy catalog UI →
        </a>
      </p>
      <AdminPanel>
        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            placeholder="Search"
            defaultValue={search}
            onBlur={(e) => patch({ search: e.target.value.trim() || null, page: "1" })}
            className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            className="rounded border border-gray-300 px-2 py-2 text-sm"
            value={category}
            onChange={(e) => patch({ category: e.target.value || null, page: "1" })}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </AdminPanel>
      {rows.length === 0 ? (
        <EmptyState title="No products" />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Provider</AdminTh>
              <AdminTh>Price</AdminTh>
              <AdminTh>Qty</AdminTh>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((p) => (
              <tr key={String(p.id)}>
                <AdminTd className="font-medium">{String(p.name ?? "")}</AdminTd>
                <AdminTd>{String(p.provider?.business_name ?? "")}</AdminTd>
                <AdminTd className="tabular-nums">{Number(p.retail_price ?? 0).toFixed(2)}</AdminTd>
                <AdminTd>{String(p.quantity ?? "")}</AdminTd>
              </tr>
            ))}
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
    </div>
  );
}
