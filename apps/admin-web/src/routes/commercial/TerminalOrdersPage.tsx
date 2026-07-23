import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { ADMIN_SECTION_COMMERCIAL } from "@beautonomi/admin-access";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { useAdminSectionPage } from "@/hooks/useAdminSectionPage";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { AdminPanel } from "@/components/ui/AdminPanel";
import { AdminPageSkeleton } from "@/components/admin/AdminPageSkeleton";
import { AdminRetryBlock } from "@/components/admin/AdminRetryBlock";
import { AdminModal } from "@/components/admin/AdminModal";
import { adminToolbarButtonClass } from "@/lib/adminUi";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
} from "@/components/admin/AdminDataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminSpaTo } from "@/lib/adminSpaPath";

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

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "dispatched",
  "delivered",
  "cancelled",
  "refunded",
  "failed",
];

const FULFILLMENT_STATUSES = [
  "pending",
  "picking",
  "packed",
  "dispatched",
  "delivered",
  "returned",
  "failed",
];

type TerminalOrder = {
  id: string;
  order_status: string;
  fulfillment_status: string;
  invoice_status: string;
  accounting_sync_status: string;
  finance_transaction_id: string | null;
  commercial_model: string;
  quantity: number;
  total_amount: number;
  currency: string;
  admin_notes: string | null;
  created_at: string;
  fulfillment_type?: string | null;
  integration_setup_status?: string | null;
  tracking_reference?: string | null;
  courier_name?: string | null;
  providers?: { business_name?: string };
  terminal_products?: { name?: string; vendor?: string };
};

export function TerminalOrdersPage() {
  const { allowed, denied } = useAdminSectionPage(ADMIN_SECTION_COMMERCIAL, "Commercial section access required");
  useAdminDocumentTitle("Terminal Orders");
  const qc = useQueryClient();

  const [editOrder, setEditOrder] = useState<TerminalOrder | null>(null);
  const [orderStatus, setOrderStatus] = useState("");
  const [fulfillmentStatus, setFulfillmentStatus] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [recordPayment, setRecordPayment] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [trackingReference, setTrackingReference] = useState("");
  const [courierName, setCourierName] = useState("");

  const { data, isLoading, isError, refetch } = useQuery<{ items: TerminalOrder[]; total: number }>({
    queryKey: adminQueryKeys.commercialTerminalOrders,
    queryFn: () => adminApi.getJson("/api/admin/commercial/terminal-orders"),
    enabled: allowed,
  });

  const updateMut = useMutation({
    mutationFn: () =>
      adminApi.patchJson(`/api/admin/commercial/terminal-orders/${editOrder!.id}`, {
        order_status: orderStatus,
        fulfillment_status: fulfillmentStatus,
        invoice_status: invoiceStatus,
        admin_notes: adminNotes.trim() || null,
        record_payment: recordPayment,
        payment_reference: paymentReference.trim() || null,
        tracking_reference: trackingReference.trim() || null,
        courier_name: courierName.trim() || null,
      }),
    onSuccess: () => {
      adminToast.success("Order updated");
      qc.invalidateQueries({ queryKey: adminQueryKeys.commercialTerminalOrders });
      setEditOrder(null);
    },
    onError: (e: Error) => adminToast.error(e.message || "Failed to update order"),
  });

  function openEdit(o: TerminalOrder) {
    setEditOrder(o);
    setOrderStatus(o.order_status);
    setFulfillmentStatus(o.fulfillment_status ?? "pending");
    setInvoiceStatus(o.invoice_status ?? "pending");
    setAdminNotes(o.admin_notes ?? "");
    setRecordPayment(false);
    setPaymentReference("");
    setTrackingReference(o.tracking_reference ?? "");
    setCourierName(o.courier_name ?? "");
  }

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
                <AdminTh>Invoice</AdminTh>
                <AdminTh>Accounting</AdminTh>
                <AdminTh>Fulfillment</AdminTh>
                <AdminTh>Setup</AdminTh>
                <AdminTh>Date</AdminTh>
                <AdminTh>Actions</AdminTh>
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
                  <AdminTd className="capitalize text-xs">{o.invoice_status?.replace(/_/g, " ") ?? "—"}</AdminTd>
                  <AdminTd>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      o.accounting_sync_status === "posted"
                        ? "bg-green-100 text-green-800"
                        : o.accounting_sync_status === "error"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                    }`}>
                      {o.accounting_sync_status?.replace(/_/g, " ") ?? "pending"}
                    </span>
                  </AdminTd>
                  <AdminTd className="capitalize text-gray-500 text-xs">
                    {(o.fulfillment_status ?? "pending").replace(/_/g, " ")}
                    {o.fulfillment_type ? ` · ${o.fulfillment_type.replace(/_/g, " ")}` : ""}
                  </AdminTd>
                  <AdminTd className="capitalize text-xs text-gray-500">
                    {(o.integration_setup_status ?? "not_required").replace(/_/g, " ")}
                    {o.integration_setup_status === "awaiting_merchant_onboarding" ? (
                      <span className="ml-1 text-amber-600" title="Dispatch blocked until merchant application is approved">
                        · gated
                      </span>
                    ) : null}
                  </AdminTd>
                  <AdminTd className="text-gray-500">{new Date(o.created_at).toLocaleDateString()}</AdminTd>
                  <AdminTd>
                    <button type="button" onClick={() => openEdit(o)} className={adminToolbarButtonClass()} title="Manage order">
                      <Settings2 className="h-3.5 w-3.5" />
                      Manage
                    </button>
                  </AdminTd>
                </tr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminPanel>

      <AdminModal
        open={!!editOrder}
        title={`Manage order${editOrder?.providers?.business_name ? `: ${editOrder.providers.business_name}` : ""}`}
        onClose={() => setEditOrder(null)}
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setEditOrder(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={updateMut.isPending}
              onClick={() => updateMut.mutate()}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {updateMut.isPending ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Order status</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={orderStatus}
              onChange={(e) => setOrderStatus(e.target.value)}
            >
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Fulfillment status</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={fulfillmentStatus}
              onChange={(e) => setFulfillmentStatus(e.target.value)}
            >
              {FULFILLMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Courier name</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={courierName}
              onChange={(e) => setCourierName(e.target.value)}
              placeholder="e.g. Courier Guy"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tracking reference</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={trackingReference}
              onChange={(e) => setTrackingReference(e.target.value)}
              placeholder="Waybill / tracking number"
            />
          </div>
          {editOrder?.fulfillment_type && (
            <div className="sm:col-span-2 text-xs text-gray-500">
              Fulfillment type: <span className="capitalize">{editOrder.fulfillment_type.replace(/_/g, " ")}</span>
              {editOrder.integration_setup_status && editOrder.integration_setup_status !== "not_required" && (
                <> · Integration setup: <span className="capitalize">{editOrder.integration_setup_status.replace(/_/g, " ")}</span></>
              )}
            </div>
          )}
          {editOrder?.integration_setup_status === "awaiting_merchant_onboarding" ? (
            <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Dispatch is blocked until the provider completes merchant onboarding and an admin approves the application.
              {" "}
              <Link
                to={adminSpaTo("/admin/commercial/terminal-onboarding")}
                className="font-medium text-amber-950 underline"
              >
                Open onboarding queue
              </Link>
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Invoice status</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={invoiceStatus}
              onChange={(e) => setInvoiceStatus(e.target.value)}
            >
              {["pending", "issued", "paid", "void", "refunded"].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          {!editOrder?.finance_transaction_id && (
            <div className="sm:col-span-2 rounded-lg border border-amber-100 bg-amber-50 p-3">
              <label className="flex items-start gap-2 text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={recordPayment}
                  onChange={(e) => setRecordPayment(e.target.checked)}
                  className="mt-0.5 rounded"
                />
                <span>
                  Record payment in finance ledger (posts GL when <code className="font-mono text-xs">terminal_accounting_enabled</code> is on)
                </span>
              </label>
              {recordPayment && (
                <input
                  className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                  placeholder="Payment reference (optional)"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              )}
            </div>
          )}
          {editOrder?.finance_transaction_id && (
            <div className="sm:col-span-2 text-xs text-gray-500">
              Finance transaction linked: <span className="font-mono">{editOrder.finance_transaction_id}</span>
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Admin notes</label>
            <textarea
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              rows={3}
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Internal notes visible to admins only"
            />
          </div>
        </div>
      </AdminModal>
    </div>
  );
}
