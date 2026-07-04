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

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  processing: "bg-indigo-100 text-indigo-800",
  dispatched: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
  refunded: "bg-red-100 text-red-800",
  failed: "bg-red-200 text-red-900",
};

type TerminalOrder = {
  id: string;
  order_status: string;
  commercial_model: string;
  quantity: number;
  total_amount: number;
  currency: string;
  created_at: string;
  providers?: { business_name?: string };
  terminal_products?: { name?: string; vendor?: string };
};

export function TerminalOrdersPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_COMMERCIAL, "Commercial section access required");
  useAdminDocumentTitle("Terminal Orders");

  const { data, isLoading, isError, refetch } = useQuery<{ items: TerminalOrder[]; total: number }>({
    queryKey: adminQueryKeys.commercialTerminalOrders,
    queryFn: () => adminApi.getJson("/api/admin/commercial/terminal-orders"),
    enabled: allowed,
  });

  if (denied) return denied;
  if (isLoading) return <AdminPageSkeleton />;
  if (isError) return <AdminRetryBlock message="Failed to load terminal orders" onRetry={() => refetch()} />;

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Terminal Orders"
        description="All provider terminal purchase, rental, and bundle orders."
      />

      <AdminPanel>
        {items.length === 0 ? (
          <EmptyState
            title="No terminal orders yet"
            description="Orders placed by providers will appear here."
          />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <tr>
                <AdminTh>Provider</AdminTh>
                <AdminTh>Product</AdminTh>
                <AdminTh>Model</AdminTh>
                <AdminTh>Qty</AdminTh>
                <AdminTh>Total</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh>Date</AdminTh>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {items.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50/60">
                  <AdminTd className="font-medium">{o.providers?.business_name ?? "—"}</AdminTd>
                  <AdminTd>{o.terminal_products?.name ?? "—"}</AdminTd>
                  <AdminTd className="capitalize text-gray-500">{o.commercial_model.replace(/_/g, " ")}</AdminTd>
                  <AdminTd>{o.quantity}</AdminTd>
                  <AdminTd>{o.currency} {Number(o.total_amount).toLocaleString()}</AdminTd>
                  <AdminTd>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[o.order_status] ?? "bg-gray-100 text-gray-700"}`}>
                      {o.order_status.replace(/_/g, " ")}
                    </span>
                  </AdminTd>
                  <AdminTd className="text-gray-500">{new Date(o.created_at).toLocaleDateString()}</AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>
    </div>
  );
}
