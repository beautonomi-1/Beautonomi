import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { isAdminApiAuthFailure } from "@/lib/adminApiError";
import { useSuperadminPage } from "@/hooks/useSuperadminPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";

type NotificationRow = {
  id: string;
  transaction_id: string;
  original_transaction_id: string;
  product_id: string;
  transaction_type: string;
  purchase_date: string;
  environment: string;
  notification_uuid: string | null;
  attribution_status: string;
  created_at: string;
};

type NotificationsPayload = {
  items: NotificationRow[];
  meta: { page: number; limit: number; total: number; has_more: boolean };
};

export function AppleNotificationsPage() {
  useAdminDocumentTitle("Apple IAP Notifications");
  const { allowed, denied } = useSuperadminPage("Apple IAP notifications are superadmin-only.");
  void allowed;
  const [page, setPage] = useState(1);
  const limit = 50;

  const q = useQuery({
    queryKey: adminQueryKeys.appleNotifications(page),
    queryFn: () =>
      adminApi.getJson<NotificationsPayload>(
        `/api/admin/monetization/apple/notifications?page=${page}&limit=${limit}`,
        { timeoutMs: 30_000 },
      ),
  });

  if (denied) return denied;
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Apple IAP Notifications" />
        <AdminPanel>
          <AdminPageSkeleton rows={8} />
        </AdminPanel>
      </div>
    );
  }
  if (q.error) {
    if (isAdminApiAuthFailure(q.error)) return <PermissionDenied />;
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Apple IAP Notifications" />
        <AdminRetryBlock message="Could not load Apple notification log." onRetry={() => void q.refetch()} />
      </div>
    );
  }

  const items = q.data?.items ?? [];
  const meta = q.data?.meta;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Apple IAP Notifications"
        description="Transactions attributed from App Store Server Notifications V2 (notification_uuid present)."
      />
      <AdminPanel>
        <AdminDataTable>
          <AdminTableHead>
            <AdminTh>Notification UUID</AdminTh>
            <AdminTh>Transaction</AdminTh>
            <AdminTh>Product</AdminTh>
            <AdminTh>Environment</AdminTh>
            <AdminTh>Attribution</AdminTh>
            <AdminTh>Received</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {items.map((row) => (
              <tr key={row.id}>
                <AdminTd className="font-mono text-xs">{row.notification_uuid ?? "—"}</AdminTd>
                <AdminTd className="font-mono text-xs">{row.transaction_id}</AdminTd>
                <AdminTd className="text-xs">{row.product_id}</AdminTd>
                <AdminTd>{row.environment}</AdminTd>
                <AdminTd>{row.attribution_status}</AdminTd>
                <AdminTd className="text-xs text-gray-500">{row.created_at}</AdminTd>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No notification-attributed transactions yet.</p>
        ) : null}
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
          <button
            type="button"
            className={adminToolbarButtonClass(page <= 1)}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {meta?.page ?? page} · {meta?.total ?? items.length} total
          </span>
          <button
            type="button"
            className={adminToolbarButtonClass(!meta?.has_more)}
            disabled={!meta?.has_more}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </AdminPanel>
    </div>
  );
}
