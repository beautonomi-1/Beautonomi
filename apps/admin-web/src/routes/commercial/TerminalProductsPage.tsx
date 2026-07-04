import { useQuery } from "@tanstack/react-query";
import { ADMIN_SECTION_COMMERCIAL } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { EmptyState } from "@/components/ui/EmptyState";

type TerminalProduct = {
  id: string;
  name: string;
  vendor: string;
  model: string | null;
  upfront_price: number | null;
  monthly_price: number | null;
  rental_price: number | null;
  currency: string;
  accounting_model: string | null;
  stock_status: string;
  active: boolean;
};

export function TerminalProductsPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_COMMERCIAL, "Commercial section access required");
  useAdminDocumentTitle("Terminal Products");

  const { data, isLoading, isError, refetch } = useQuery<{ items: TerminalProduct[]; total: number }>({
    queryKey: adminQueryKeys.commercialTerminalProducts,
    queryFn: () => adminApi.getJson("/api/admin/commercial/terminal-products"),
    enabled: allowed,
  });

  if (denied) return denied;
  if (isLoading) return <AdminPageSkeleton />;
  if (isError) return <AdminRetryBlock message="Failed to load terminal products" onRetry={() => refetch()} />;

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Terminal Products"
        description="Card machine and payment terminal catalog for provider e-commerce."
      />

      <AdminPanel>
        {items.length === 0 ? (
          <EmptyState
            title="No terminal products yet"
            description="Add terminal products to enable provider e-commerce."
          />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Product</AdminTh>
                <AdminTh>Vendor</AdminTh>
                <AdminTh>Upfront</AdminTh>
                <AdminTh>Monthly</AdminTh>
                <AdminTh>Rental</AdminTh>
                <AdminTh>Model</AdminTh>
                <AdminTh>Stock</AdminTh>
                <AdminTh>Status</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50/60">
                  <AdminTd className="font-medium text-slate-900">{p.name}</AdminTd>
                  <AdminTd className="capitalize">{p.vendor}</AdminTd>
                  <AdminTd>{p.upfront_price != null ? `${p.currency} ${Number(p.upfront_price).toLocaleString()}` : "—"}</AdminTd>
                  <AdminTd>{p.monthly_price != null ? `${p.currency} ${Number(p.monthly_price).toLocaleString()}` : "—"}</AdminTd>
                  <AdminTd>{p.rental_price != null ? `${p.currency} ${Number(p.rental_price).toLocaleString()}` : "—"}</AdminTd>
                  <AdminTd>{p.model ?? "—"}</AdminTd>
                  <AdminTd className="capitalize">{p.stock_status.replace(/_/g, " ")}</AdminTd>
                  <AdminTd>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${p.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                      {p.active ? "Active" : "Inactive"}
                    </span>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>
    </div>
  );
}
